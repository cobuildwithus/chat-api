import { eq, sql } from "drizzle-orm";
import { getNeynarTimeoutMs, getOpenAiTimeoutMs } from "../../config/env";
import { getOrSetCachedResultWithLock } from "../../infra/cache/cacheResult";
import { formatCobuildAiContextError, getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { farcasterProfiles } from "../../infra/db/schema";
import { createTimeoutFetch, withTimeout } from "../../infra/http/timeout";
import { getNeynarClient } from "../../infra/neynar/client";

export const NO_STORE_CACHE_CONTROL = "no-store";
export const SHORT_PRIVATE_CACHE_CONTROL = "private, max-age=60";
export const SHORT_PUBLIC_CACHE_CONTROL = "public, max-age=60";

const GET_USER_CACHE_PREFIX = "farcaster:get-user:";
const GET_USER_CACHE_TTL_SECONDS = 60 * 10;

const GET_CAST_CACHE_PREFIX = "buildbot-tools:get-cast:";
const GET_CAST_CACHE_TTL_SECONDS = 60 * 2;

const OPENAI_VECTOR_STORES_URL = "https://api.openai.com/v1/vector_stores";
const DEFAULT_DOCS_SEARCH_LIMIT = 8;
const DOCS_SEARCH_LIMIT_MIN = 1;
const DOCS_SEARCH_LIMIT_MAX = 20;
const DOCS_BASE_URL = "https://docs.co.build";
const ERROR_MAX_LENGTH = 140;
const SNIPPET_MAX_LENGTH = 420;

type JsonSchema = Record<string, unknown>;

export type ToolSideEffects = "none" | "read" | "network-read";

export type ToolMetadata = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  scopes: string[];
  sideEffects: ToolSideEffects;
  version: string;
  deprecated: boolean;
  aliases?: string[];
};

export type ToolExecutionSuccess = {
  ok: true;
  name: string;
  output: unknown;
  cacheControl?: string;
};

export type ToolExecutionFailure = {
  ok: false;
  name: string;
  statusCode: number;
  error: string;
};

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

type ToolExecute = (input: unknown) => Promise<ToolExecutionResult>;

type RegisteredTool = ToolMetadata & {
  aliases: string[];
  execute: ToolExecute;
};

type GetCastType = "hash" | "url";

type DocsSearchResult = {
  fileId: string | null;
  filename: string | null;
  score: number | null;
  snippet: string | null;
  path: string | null;
  slug: string | null;
  url: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  return {};
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

function getDocsSearchErrorMessage(error: unknown): string {
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

function success(
  name: string,
  output: unknown,
  cacheControl?: string,
): ToolExecutionSuccess {
  return {
    ok: true,
    name,
    output,
    ...(cacheControl ? { cacheControl } : {}),
  };
}

function failure(
  name: string,
  statusCode: number,
  error: string,
): ToolExecutionFailure {
  return { ok: false, name, statusCode, error };
}

async function executeGetUser(input: unknown): Promise<ToolExecutionResult> {
  const name = "get-user";
  const body = asRecord(input);
  if (typeof body.fname !== "string") {
    return failure(name, 400, "fname must be a string.");
  }
  const fname = body.fname.trim();
  if (!fname) {
    return failure(name, 400, "fname must not be empty.");
  }

  try {
    const cacheKey = fname.toLowerCase();
    const result = await getOrSetCachedResultWithLock(
      cacheKey,
      GET_USER_CACHE_PREFIX,
      async () => {
        const user = await cobuildDb
          .select()
          .from(farcasterProfiles)
          .where(eq(farcasterProfiles.fname, fname))
          .limit(1)
          .then((rows) => rows[0]);

        if (!user) {
          const users = await cobuildDb
            .select()
            .from(farcasterProfiles)
            .where(sql`${farcasterProfiles.fname} ILIKE ${`%${fname}%`}`);
          return { usedLikeQuery: true, users };
        }

        return {
          fid: user.fid,
          fname: user.fname,
          addresses: user.verifiedAddresses || [],
        };
      },
      GET_USER_CACHE_TTL_SECONDS,
    );

    return success(name, result, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `get-user request failed: ${formatCobuildAiContextError(error)}`);
  }
}

async function executeGetCast(input: unknown): Promise<ToolExecutionResult> {
  const name = "get-cast";
  const body = asRecord(input);
  if (typeof body.identifier !== "string") {
    return failure(name, 400, "identifier must be a string.");
  }
  const identifier = body.identifier.trim();
  if (!identifier) {
    return failure(name, 400, "identifier must not be empty.");
  }
  if (body.type !== "hash" && body.type !== "url") {
    return failure(name, 400, 'type must be either "hash" or "url".');
  }
  const type = body.type as GetCastType;

  try {
    const cacheKey = `${type}:${identifier.toLowerCase()}`;
    const cast = await getOrSetCachedResultWithLock(
      cacheKey,
      GET_CAST_CACHE_PREFIX,
      async () => {
        const neynarClient = getNeynarClient();
        if (!neynarClient) {
          throw new Error("Neynar API key is not configured.");
        }

        const response = await withTimeout(
          neynarClient.lookupCastByHashOrUrl({ identifier, type }),
          getNeynarTimeoutMs(),
          "Neynar getCast",
        );
        return response.cast ?? null;
      },
      GET_CAST_CACHE_TTL_SECONDS,
    );

    if (!cast) {
      return failure(name, 404, "Cast not found.");
    }

    return success(name, cast, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    const message = formatCobuildAiContextError(error);
    const isConfigError = message.includes("Neynar API key is not configured");
    return failure(name, isConfigError ? 503 : 502, `get-cast request failed: ${message}`);
  }
}

async function executeCastPreview(input: unknown): Promise<ToolExecutionResult> {
  const name = "cast-preview";
  const body = asRecord(input);
  if (typeof body.text !== "string") {
    return failure(name, 400, "text must be a string.");
  }
  const text = body.text.trim();
  if (!text) {
    return failure(name, 400, "text must not be empty.");
  }

  const embeds = Array.isArray(body.embeds) ? body.embeds : undefined;
  const parent = typeof body.parent === "string" && body.parent.length > 0 ? body.parent : undefined;
  const preview = {
    text,
    ...(embeds ? { embeds } : {}),
    ...(parent ? { parent } : {}),
  };

  return success(name, preview, NO_STORE_CACHE_CONTROL);
}

async function executeCobuildAiContext(_input: unknown): Promise<ToolExecutionResult> {
  const name = "cobuild-ai-context";
  try {
    const snapshot = await getCobuildAiContextSnapshot();
    if (!snapshot.data) {
      return failure(
        name,
        502,
        `cobuild-ai-context request failed: ${snapshot.error ?? "unknown error"}`,
      );
    }

    return success(name, snapshot.data, SHORT_PUBLIC_CACHE_CONTROL);
  } catch (error) {
    return failure(
      name,
      502,
      `cobuild-ai-context request failed: ${formatCobuildAiContextError(error)}`,
    );
  }
}

async function executeDocsSearch(input: unknown): Promise<ToolExecutionResult> {
  const name = "docs-search";
  const vectorStoreId = process.env.DOCS_VECTOR_STORE_ID?.trim();
  if (!vectorStoreId) {
    return failure(name, 503, "Docs search is not configured (missing DOCS_VECTOR_STORE_ID).");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return failure(name, 503, "Docs search is not configured (missing OPENAI_API_KEY).");
  }

  const body = asRecord(input);
  if (typeof body.query !== "string") {
    return failure(name, 400, "Query must be a string.");
  }
  const query = body.query.trim();
  if (!query) {
    return failure(name, 400, "Query must not be empty.");
  }

  const limit = body.limit ?? DEFAULT_DOCS_SEARCH_LIMIT;
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return failure(name, 400, "Limit must be a number.");
  }
  if (limit < DOCS_SEARCH_LIMIT_MIN || limit > DOCS_SEARCH_LIMIT_MAX) {
    return failure(name, 400, `Limit must be between ${DOCS_SEARCH_LIMIT_MIN} and ${DOCS_SEARCH_LIMIT_MAX}.`);
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
          query,
          max_num_results: limit,
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
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    return failure(name, 502, `Docs search request failed: ${getDocsSearchErrorMessage(error)}`);
  }
}

const TOOL_DEFINITIONS: RegisteredTool[] = [
  {
    name: "get-user",
    aliases: ["getUser", "buildbot.get-user"],
    description:
      "Get Farcaster profile details by fname, with exact match first and fuzzy fallback.",
    inputSchema: {
      type: "object",
      required: ["fname"],
      properties: {
        fname: { type: "string", minLength: 1, maxLength: 64 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      oneOf: [
        {
          type: "object",
          required: ["fid", "fname", "addresses"],
          properties: {
            fid: { type: ["string", "number", "integer"] },
            fname: { type: "string" },
            addresses: { type: "array", items: { type: "string" } },
          },
          additionalProperties: true,
        },
        {
          type: "object",
          required: ["usedLikeQuery", "users"],
          properties: {
            usedLikeQuery: { type: "boolean" },
            users: { type: "array", items: { type: "object" } },
          },
          additionalProperties: true,
        },
      ],
    },
    scopes: ["buildbot-tools", "farcaster"],
    sideEffects: "read",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetUser,
  },
  {
    name: "get-cast",
    aliases: ["getCast", "buildbot.get-cast"],
    description: "Get cast details from Neynar by cast hash or Warpcast URL.",
    inputSchema: {
      type: "object",
      required: ["identifier", "type"],
      properties: {
        identifier: { type: "string", minLength: 1, maxLength: 2048 },
        type: { type: "string", enum: ["hash", "url"] },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    scopes: ["buildbot-tools", "farcaster", "neynar"],
    sideEffects: "network-read",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetCast,
  },
  {
    name: "cast-preview",
    aliases: ["castPreview", "buildbot.cast-preview"],
    description: "Normalize cast preview payload for downstream publishing flow.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 1, maxLength: 1024 },
        embeds: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            required: ["url"],
            properties: {
              url: { type: "string", minLength: 1, maxLength: 2048 },
            },
            additionalProperties: false,
          },
        },
        parent: { type: "string", minLength: 1, maxLength: 512 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        embeds: { type: "array", items: { type: "object" } },
        parent: { type: "string" },
      },
      additionalProperties: false,
    },
    scopes: ["buildbot-tools"],
    sideEffects: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeCastPreview,
  },
  {
    name: "cobuild-ai-context",
    aliases: ["getCobuildAiContext", "buildbot.cobuild-ai-context"],
    description: "Fetch cached Cobuild AI context snapshot.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    scopes: ["buildbot-tools", "cobuild-context"],
    sideEffects: "network-read",
    version: "1.0.0",
    deprecated: false,
    execute: executeCobuildAiContext,
  },
  {
    name: "docs-search",
    aliases: ["docs.search", "file_search"],
    description: "Search Cobuild documentation via OpenAI vector store.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "number", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
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
    version: "1.0.0",
    deprecated: false,
    execute: executeDocsSearch,
  },
];

const TOOL_LOOKUP = new Map<string, RegisteredTool>();
for (const tool of TOOL_DEFINITIONS) {
  for (const key of [tool.name, ...tool.aliases]) {
    if (TOOL_LOOKUP.has(key)) {
      throw new Error(`Duplicate tool registration for key "${key}"`);
    }
    TOOL_LOOKUP.set(key, tool);
  }
}

function toMetadata(tool: RegisteredTool): ToolMetadata {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    scopes: tool.scopes,
    sideEffects: tool.sideEffects,
    version: tool.version,
    deprecated: tool.deprecated,
    aliases: tool.aliases,
  };
}

export function listToolMetadata(): ToolMetadata[] {
  return TOOL_DEFINITIONS.map(toMetadata);
}

export function resolveToolMetadata(name: string): ToolMetadata | null {
  const tool = TOOL_LOOKUP.get(name);
  if (!tool) {
    return null;
  }
  return toMetadata(tool);
}

export async function executeTool(name: string, input: unknown): Promise<ToolExecutionResult> {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return failure("", 400, "Tool name must not be empty.");
  }

  const tool = TOOL_LOOKUP.get(normalizedName);
  if (!tool) {
    return failure(normalizedName, 404, `Unknown tool "${normalizedName}".`);
  }

  const result = await tool.execute(input);
  if (result.name === tool.name) {
    return result;
  }
  return { ...result, name: tool.name };
}
