import { z } from "zod";
import { getOpenAiTimeoutMs } from "../../config/env";
import { getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";
import { createTimeoutFetch } from "../../infra/http/timeout";
import { getRevnetIssuanceTermsSnapshot } from "../../infra/revnet-issuance-terms";
import {
  NO_STORE_CACHE_CONTROL,
  SHORT_PUBLIC_CACHE_CONTROL,
  failureFromPublicError,
  success,
} from "./runtime";
import type { RawRegisteredTool } from "./types";
import {
  asNumber,
  asString,
  isFeatureEnabled,
  isRecord,
} from "./utils";

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
const DEFAULT_DOCS_SEARCH_LIMIT = 8;
const DOCS_SEARCH_QUERY_MAX = 1000;
const DOCS_BASE_URL = "https://docs.co.build";
const ENABLE_CLI_DOCS_SEARCH_ENV = "ENABLE_CLI_DOCS_SEARCH";
const SNIPPET_MAX_LENGTH = 420;

const getTreasuryStatsInputSchema = z.object({}).strict();
const getRevnetIssuanceTermsInputSchema = z.object({
  projectId: z.number().int().positive().optional(),
  chainId: z.number().int().positive().optional(),
}).strict();
const docsSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(DOCS_SEARCH_QUERY_MAX),
  limit: z.number().int().min(1).max(20).default(DEFAULT_DOCS_SEARCH_LIMIT),
}).strict();

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

async function executeGetTreasuryStats() {
  const name = "get-treasury-stats";
  try {
    const snapshot = await getCobuildAiContextSnapshot();
    if (!snapshot.data) {
      return failureFromPublicError(name, "toolExecutionFailed");
    }

    return success(name, snapshot.data, SHORT_PUBLIC_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetRevnetIssuanceTerms(
  input: z.infer<typeof getRevnetIssuanceTermsInputSchema>,
) {
  const name = "get-revnet-issuance-terms";
  try {
    const snapshot = await getRevnetIssuanceTermsSnapshot(input);
    return success(name, snapshot, SHORT_PUBLIC_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeDocsSearch(
  input: z.infer<typeof docsSearchInputSchema>,
) {
  const name = "docs-search";
  if (!isFeatureEnabled(ENABLE_CLI_DOCS_SEARCH_ENV, true)) {
    return failureFromPublicError(name, "toolDisabled");
  }

  const vectorStoreId = process.env.DOCS_VECTOR_STORE_ID?.trim();
  if (!vectorStoreId) {
    return failureFromPublicError(name, "toolUnavailable");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return failureFromPublicError(name, "toolUnavailable");
  }

  try {
    const openAiFetch = createTimeoutFetch({
      timeoutMs: getOpenAiTimeoutMs(),
      name: "OpenAI",
    });
    const response = await openAiFetch(
      `${OPENAI_VECTOR_STORES_URL}/${encodeURIComponent(vectorStoreId)}/search`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: input.query,
          max_num_results: input.limit,
        }),
      },
    );

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
    return success(name, {
      query: input.query,
      count: results.length,
      results,
    }, NO_STORE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

export const contextToolDefinitions: RawRegisteredTool[] = [
  {
    name: "get-treasury-stats",
    aliases: [],
    description: "Fetch cached treasury stats snapshot.",
    input: getTreasuryStatsInputSchema,
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    scopes: ["cli-tools", "cobuild-context"],
    exposure: "chat-safe",
    sideEffects: "network-read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetTreasuryStats,
  },
  {
    name: "get-revnet-issuance-terms",
    aliases: ["getRevnetIssuanceTerms", "revnetIssuanceTerms"],
    description: "Fetch indexed revnet issuance terms and timeline data.",
    input: getRevnetIssuanceTermsInputSchema,
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    scopes: ["cli-tools", "cobuild-context"],
    exposure: "chat-safe",
    sideEffects: "network-read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetRevnetIssuanceTerms,
  },
  {
    name: "docs-search",
    aliases: ["docs.search", "file_search"],
    description: "Search Cobuild documentation via OpenAI vector store.",
    input: docsSearchInputSchema,
    outputSchema: {
      type: "object",
      required: ["query", "count", "results"],
      properties: {
        query: { type: "string" },
        count: { type: "number" },
        results: { type: "array", items: { type: "object" } },
      },
      additionalProperties: false,
    },
    scopes: ["docs"],
    sideEffects: "network-read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeDocsSearch,
  },
];
