import type { FastifyReply, FastifyRequest } from "fastify";

type DocsSearchBody = {
  query: string;
  limit?: number;
};

type DocsSearchResult = {
  fileId: string | null;
  filename: string | null;
  score: number | null;
  snippet: string | null;
  path: string | null;
  slug: string | null;
  url: string | null;
};

const OPENAI_VECTOR_STORES_URL = "https://api.openai.com/v1/vector_stores";
const DEFAULT_LIMIT = 8;
const ERROR_MAX_LENGTH = 140;
const SNIPPET_MAX_LENGTH = 420;
const DOCS_BASE_URL = "https://docs.co.build";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncate(value: string, maxLength = ERROR_MAX_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return truncate(error.message);
  }
  if (typeof error === "string") {
    return truncate(error);
  }
  return "Unknown error";
}

function getTextSnippet(entry: Record<string, unknown>): string | null {
  const direct = asString(entry.text);
  if (direct) {
    return direct.length > SNIPPET_MAX_LENGTH ? `${direct.slice(0, SNIPPET_MAX_LENGTH)}...` : direct;
  }

  const content = entry.content;
  if (!Array.isArray(content)) {
    return null;
  }

  for (const item of content) {
    if (!isRecord(item)) continue;
    const text = asString(item.text);
    if (!text) continue;
    return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH)}...` : text;
  }
  return null;
}

function buildDocsUrl(slug: string | null): string | null {
  if (!slug) return null;
  const normalized = slug.startsWith("/") ? slug : `/${slug}`;
  return `${DOCS_BASE_URL}${normalized}`;
}

function getRawSearchEntries(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];

  const data = payload.data;
  if (Array.isArray(data)) {
    return data.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  }

  // Backward compatibility for Responses API file_search payloads.
  const output = payload.output;
  if (!Array.isArray(output)) return [];

  const entries: Record<string, unknown>[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "file_search_call") continue;
    const callResults = item.results;
    if (!Array.isArray(callResults)) continue;
    for (const rawEntry of callResults) {
      if (!isRecord(rawEntry)) continue;
      entries.push(rawEntry);
    }
  }

  return entries;
}

function extractDocsSearchResults(payload: unknown): DocsSearchResult[] {
  const entries = getRawSearchEntries(payload);
  const results: DocsSearchResult[] = [];
  for (const rawEntry of entries) {
    const attributes = isRecord(rawEntry.attributes) ? rawEntry.attributes : {};
    const slug = asString(attributes.slug);
    results.push({
      fileId: asString(rawEntry.file_id),
      filename: asString(rawEntry.filename),
      score: asNumber(rawEntry.score),
      snippet: getTextSnippet(rawEntry),
      path: asString(attributes.path),
      slug,
      url: buildDocsUrl(slug),
    });
  }

  return results;
}

export async function handleDocsSearchRequest(
  request: FastifyRequest<{ Body: DocsSearchBody }>,
  reply: FastifyReply,
) {
  const vectorStoreId = process.env.DOCS_VECTOR_STORE_ID?.trim();
  if (!vectorStoreId) {
    return reply.status(503).send({ error: "Docs search is not configured (missing DOCS_VECTOR_STORE_ID)." });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return reply.status(503).send({ error: "Docs search is not configured (missing OPENAI_API_KEY)." });
  }

  const query = request.body.query.trim();
  if (!query) {
    return reply.status(400).send({ error: "Query must not be empty." });
  }

  const limit = request.body.limit ?? DEFAULT_LIMIT;

  try {
    const response = await fetch(`${OPENAI_VECTOR_STORES_URL}/${encodeURIComponent(vectorStoreId)}/search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        max_num_results: limit,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI vector store search request failed with status ${response.status}`);
    }

    let payload: unknown = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error("OpenAI vector store search returned invalid JSON.");
    }

    const results = extractDocsSearchResults(payload);
    return reply.send({
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    return reply.status(502).send({
      error: `Docs search request failed: ${getErrorMessage(error)}`,
    });
  }
}
