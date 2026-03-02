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
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_CAST_EMBEDDING_MODEL = "text-embedding-3-small";
const CAST_EMBEDDING_DIMENSIONS = 256;

const DEFAULT_DOCS_SEARCH_LIMIT = 8;
const DOCS_SEARCH_LIMIT_MIN = 1;
const DOCS_SEARCH_LIMIT_MAX = 20;
const DOCS_BASE_URL = "https://docs.co.build";

const DISCUSSION_CHANNEL_URL = "https://farcaster.xyz/~/channel/cobuild";
const NEYNAR_SCORE_THRESHOLD = 0.55;
const DEFAULT_DISCUSSION_LIMIT = 20;
const DEFAULT_THREAD_PAGE = 1;
const DEFAULT_THREAD_PAGE_SIZE = 20;
const DEFAULT_SEMANTIC_LIMIT = 12;
const DISCUSSION_LIMIT_MIN = 1;
const DISCUSSION_LIMIT_MAX = 50;
const THREAD_PAGE_SIZE_MIN = 1;
const THREAD_PAGE_SIZE_MAX = 100;
const SEMANTIC_LIMIT_MIN = 1;
const SEMANTIC_LIMIT_MAX = 25;
const CAST_CHARACTER_LIMIT = 1024;

const NEYNAR_API_BASE = "https://api.neynar.com/v2/farcaster";
const NEYNAR_CAST_ENDPOINT = `${NEYNAR_API_BASE}/cast/`;

const ERROR_MAX_LENGTH = 140;
const SNIPPET_MAX_LENGTH = 420;
const EXCERPT_MAX_LENGTH = 280;
const TITLE_MAX_LENGTH = 160;

const CAST_HASH_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SIGNER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NEYNAR_JSON_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
} as const;

type JsonSchema = Record<string, unknown>;

type DiscussionSort = "last" | "replies" | "views";
type DiscussionSortDirection = "asc" | "desc";
type GetCastType = "hash" | "url";

export type ToolSideEffects = "none" | "read" | "network-read" | "network-write";

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

type DocsSearchResult = {
  fileId: string | null;
  filename: string | null;
  score: number | null;
  snippet: string | null;
  path: string | null;
  slug: string | null;
  url: string | null;
};

type DiscussionListRow = {
  hashHex: string;
  text: string | null;
  castTimestamp: Date | string | null;
  replyCount: string | number | null;
  viewCount: string | number | null;
  lastReplyTimestamp: Date | string | null;
  lastReplyAuthorFname: string | null;
  authorFid: number | null;
  authorFname: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorNeynarScore: number | null;
};

type ThreadCastRow = {
  hashHex: string;
  parentHashHex: string | null;
  text: string | null;
  castTimestamp: Date | string | null;
  viewCount: string | number | null;
  authorFid: number | null;
  authorFname: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorNeynarScore: number | null;
};

type SemanticSearchRow = {
  hashHex: string;
  parentHashHex: string | null;
  rootHashHex: string;
  text: string | null;
  castTimestamp: Date | string | null;
  distance: number | string | null;
  authorFid: number | null;
  authorFname: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorNeynarScore: number | null;
};

type NeynarPublishResponse = {
  success?: boolean;
  cast?: {
    hash?: string;
    [key: string]: unknown;
  } | null;
  message?: string;
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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value);
  if (number === null) return null;
  if (!Number.isInteger(number)) return null;
  return number;
}

function truncate(value: string, maxLength = ERROR_MAX_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeHttpUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeCastHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return CAST_HASH_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

function castHashToHex(hash: string): string {
  return hash.slice(2);
}

function castHashToBuffer(hash: string): Buffer {
  return Buffer.from(castHashToHex(hash), "hex");
}

function fromHexToCastHash(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) return null;
  return `0x${normalized}`;
}

function toExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= EXCERPT_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, EXCERPT_MAX_LENGTH - 3)}...`;
}

function toTitle(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Untitled discussion";
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX_LENGTH - 3)}...`;
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

function toDiscussionSort(value: unknown): DiscussionSort {
  if (value === "replies" || value === "views" || value === "last") {
    return value;
  }
  return "last";
}

function toDiscussionSortDirection(value: unknown): DiscussionSortDirection {
  if (value === "asc" || value === "desc") {
    return value;
  }
  return "desc";
}

function toDiscussionOrderBy(sort: DiscussionSort, direction: DiscussionSortDirection) {
  const directionSql = sql.raw(direction === "asc" ? "ASC" : "DESC");
  if (sort === "replies") {
    return sql`c.reply_count ${directionSql} NULLS LAST, COALESCE(c.last_activity_at, c.timestamp) DESC NULLS LAST`;
  }
  if (sort === "views") {
    return sql`c.view_count ${directionSql} NULLS LAST, COALESCE(c.last_activity_at, c.timestamp) DESC NULLS LAST`;
  }
  return sql`COALESCE(c.last_activity_at, c.timestamp) ${directionSql} NULLS LAST, c.timestamp DESC NULLS LAST`;
}

function toAuthor(row: {
  authorFid: unknown;
  authorFname: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorNeynarScore: unknown;
}) {
  const username = asString(row.authorFname) ?? asString(row.authorDisplayName);
  const authorFid = asNumber(row.authorFid);
  return {
    fid: authorFid,
    username: username ?? (authorFid !== null ? `fid:${authorFid}` : "unknown"),
    display_name: row.authorDisplayName,
    pfp_url: row.authorAvatarUrl,
    neynar_score: asNumber(row.authorNeynarScore),
  };
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

function parseBoundedInteger(params: {
  value: unknown;
  field: string;
  min: number;
  max: number;
  defaultValue: number;
}): { ok: true; value: number } | { ok: false; error: string } {
  if (params.value === undefined || params.value === null) {
    return { ok: true, value: params.defaultValue };
  }
  const parsed = asInteger(params.value);
  if (parsed === null) {
    return { ok: false, error: `${params.field} must be an integer.` };
  }
  if (parsed < params.min || parsed > params.max) {
    return {
      ok: false,
      error: `${params.field} must be between ${params.min} and ${params.max}.`,
    };
  }
  return { ok: true, value: parsed };
}

function toVectorLiteral(vector: number[]): string {
  const sanitized = vector.map((value) => (Number.isFinite(value) ? value : 0));
  return `[${sanitized.join(",")}]`;
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
  const name = "get-treasury-stats";
  try {
    const snapshot = await getCobuildAiContextSnapshot();
    if (!snapshot.data) {
      return failure(
        name,
        502,
        `get-treasury-stats request failed: ${snapshot.error ?? "unknown error"}`,
      );
    }

    return success(name, snapshot.data, SHORT_PUBLIC_CACHE_CONTROL);
  } catch (error) {
    return failure(
      name,
      502,
      `get-treasury-stats request failed: ${formatCobuildAiContextError(error)}`,
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

async function executeListDiscussions(input: unknown): Promise<ToolExecutionResult> {
  const name = "list-discussions";
  const body = asRecord(input);

  const parsedLimit = parseBoundedInteger({
    value: body.limit,
    field: "limit",
    min: DISCUSSION_LIMIT_MIN,
    max: DISCUSSION_LIMIT_MAX,
    defaultValue: DEFAULT_DISCUSSION_LIMIT,
  });
  if (!parsedLimit.ok) {
    return failure(name, 400, parsedLimit.error);
  }

  const parsedOffset = parseBoundedInteger({
    value: body.offset,
    field: "offset",
    min: 0,
    max: 10000,
    defaultValue: 0,
  });
  if (!parsedOffset.ok) {
    return failure(name, 400, parsedOffset.error);
  }

  const sort = toDiscussionSort(body.sort);
  const direction = toDiscussionSortDirection(body.direction);
  const orderBy = toDiscussionOrderBy(sort, direction);

  try {
    const result = (await cobuildDb.execute(sql`
      SELECT
        encode(c.hash, 'hex') AS "hashHex",
        c.text AS "text",
        c.timestamp AS "castTimestamp",
        c.reply_count AS "replyCount",
        c.view_count AS "viewCount",
        c.last_reply_at AS "lastReplyTimestamp",
        lr.fname AS "lastReplyAuthorFname",
        p.fid AS "authorFid",
        p.fname AS "authorFname",
        p.display_name AS "authorDisplayName",
        p.avatar_url AS "authorAvatarUrl",
        p.neynar_user_score AS "authorNeynarScore"
      FROM farcaster.casts c
      LEFT JOIN farcaster.profiles p ON p.fid = c.fid
      LEFT JOIN farcaster.profiles lr ON lr.fid = c.last_reply_fid AND lr.hidden_at IS NULL
      WHERE c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND c.parent_hash IS NULL
        AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
        AND c.text IS NOT NULL
        AND btrim(c.text) <> ''
        AND c.fid IS NOT NULL
        AND p.hidden_at IS NULL
        AND p.neynar_user_score IS NOT NULL
        AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
      ORDER BY ${orderBy}
      LIMIT ${parsedLimit.value + 1}
      OFFSET ${parsedOffset.value}
    `)) as { rows?: DiscussionListRow[] };

    const rows = result.rows ?? [];
    const hasMore = rows.length > parsedLimit.value;
    const pageRows = hasMore ? rows.slice(0, parsedLimit.value) : rows;

    const items = pageRows.map((row) => {
      const hash = fromHexToCastHash(row.hashHex);
      const text = asString(row.text) ?? "";
      const author = toAuthor(row);
      return {
        hash,
        title: toTitle(text),
        excerpt: toExcerpt(text),
        text,
        authorUsername: author.username,
        author,
        createdAt: toIsoString(row.castTimestamp),
        replyCount: asNumber(row.replyCount) ?? 0,
        viewCount: asNumber(row.viewCount) ?? 0,
        lastReply: row.lastReplyTimestamp
          ? {
              createdAt: toIsoString(row.lastReplyTimestamp),
              authorUsername: row.lastReplyAuthorFname ?? "unknown",
            }
          : null,
      };
    });

    return success(name, {
      items,
      hasMore,
      limit: parsedLimit.value,
      offset: parsedOffset.value,
      sort,
      direction,
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `list-discussions request failed: ${formatCobuildAiContextError(error)}`);
  }
}

async function executeGetDiscussionThread(input: unknown): Promise<ToolExecutionResult> {
  const name = "get-discussion-thread";
  const body = asRecord(input);

  const rootHash = normalizeCastHash(body.rootHash);
  if (!rootHash) {
    return failure(name, 400, "rootHash must be a full cast hash (0x + 40 hex chars).");
  }

  const parsedPage = parseBoundedInteger({
    value: body.page,
    field: "page",
    min: 1,
    max: 10000,
    defaultValue: DEFAULT_THREAD_PAGE,
  });
  if (!parsedPage.ok) {
    return failure(name, 400, parsedPage.error);
  }

  const parsedPageSize = parseBoundedInteger({
    value: body.pageSize,
    field: "pageSize",
    min: THREAD_PAGE_SIZE_MIN,
    max: THREAD_PAGE_SIZE_MAX,
    defaultValue: DEFAULT_THREAD_PAGE_SIZE,
  });
  if (!parsedPageSize.ok) {
    return failure(name, 400, parsedPageSize.error);
  }

  const focusHash = body.focusHash === undefined ? null : normalizeCastHash(body.focusHash);
  if (body.focusHash !== undefined && !focusHash) {
    return failure(name, 400, "focusHash must be a full cast hash (0x + 40 hex chars).");
  }

  const rootBuffer = castHashToBuffer(rootHash);

  try {
    const rootResult = (await cobuildDb.execute(sql`
      SELECT
        encode(c.hash, 'hex') AS "hashHex",
        encode(c.parent_hash, 'hex') AS "parentHashHex",
        c.text AS "text",
        c.timestamp AS "castTimestamp",
        c.view_count AS "viewCount",
        p.fid AS "authorFid",
        p.fname AS "authorFname",
        p.display_name AS "authorDisplayName",
        p.avatar_url AS "authorAvatarUrl",
        p.neynar_user_score AS "authorNeynarScore"
      FROM farcaster.casts c
      LEFT JOIN farcaster.profiles p ON p.fid = c.fid
      WHERE c.hash = ${rootBuffer}
        AND c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND c.parent_hash IS NULL
        AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
        AND c.text IS NOT NULL
        AND btrim(c.text) <> ''
        AND c.fid IS NOT NULL
        AND p.hidden_at IS NULL
        AND p.neynar_user_score IS NOT NULL
        AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
      LIMIT 1
    `)) as { rows?: ThreadCastRow[] };

    const rootRow = rootResult.rows?.[0] ?? null;
    if (!rootRow) {
      return failure(name, 404, "Discussion thread not found.");
    }

    const countResult = (await cobuildDb.execute(sql`
      SELECT COUNT(*)::bigint AS count
      FROM farcaster.casts c
      JOIN farcaster.profiles p ON p.fid = c.fid
      WHERE c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND c.root_parent_hash = ${rootBuffer}
        AND c.hash <> ${rootBuffer}
        AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
        AND c.text IS NOT NULL
        AND btrim(c.text) <> ''
        AND c.fid IS NOT NULL
        AND p.hidden_at IS NULL
        AND p.neynar_user_score IS NOT NULL
        AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
    `)) as { rows?: Array<{ count?: string | number | null }> };

    const replyCount = asNumber(countResult.rows?.[0]?.count) ?? 0;
    const totalPages = Math.max(1, Math.ceil(replyCount / parsedPageSize.value));

    let effectivePage = Math.max(1, Math.min(parsedPage.value, totalPages));
    if (focusHash && focusHash !== rootHash) {
      const focusRows = (await cobuildDb.execute(sql`
        SELECT encode(c.hash, 'hex') AS "hashHex"
        FROM farcaster.casts c
        JOIN farcaster.profiles p ON p.fid = c.fid
        WHERE c.deleted_at IS NULL
          AND c.hidden_at IS NULL
          AND c.root_parent_hash = ${rootBuffer}
          AND c.hash <> ${rootBuffer}
          AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
          AND c.text IS NOT NULL
          AND btrim(c.text) <> ''
          AND c.fid IS NOT NULL
          AND p.hidden_at IS NULL
          AND p.neynar_user_score IS NOT NULL
          AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
        ORDER BY c.timestamp ASC NULLS LAST, c.hash ASC
      `)) as { rows?: Array<{ hashHex?: string | null }> };

      const focusHex = castHashToHex(focusHash);
      const focusIndex = (focusRows.rows ?? []).findIndex((row) => row.hashHex === focusHex);
      if (focusIndex >= 0) {
        effectivePage = Math.floor(focusIndex / parsedPageSize.value) + 1;
      }
    }

    const offset = (effectivePage - 1) * parsedPageSize.value;
    const repliesResult = (await cobuildDb.execute(sql`
      SELECT
        encode(c.hash, 'hex') AS "hashHex",
        encode(c.parent_hash, 'hex') AS "parentHashHex",
        c.text AS "text",
        c.timestamp AS "castTimestamp",
        c.view_count AS "viewCount",
        p.fid AS "authorFid",
        p.fname AS "authorFname",
        p.display_name AS "authorDisplayName",
        p.avatar_url AS "authorAvatarUrl",
        p.neynar_user_score AS "authorNeynarScore"
      FROM farcaster.casts c
      JOIN farcaster.profiles p ON p.fid = c.fid
      WHERE c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND c.root_parent_hash = ${rootBuffer}
        AND c.hash <> ${rootBuffer}
        AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
        AND c.text IS NOT NULL
        AND btrim(c.text) <> ''
        AND c.fid IS NOT NULL
        AND p.hidden_at IS NULL
        AND p.neynar_user_score IS NOT NULL
        AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
      ORDER BY c.timestamp ASC NULLS LAST, c.hash ASC
      LIMIT ${parsedPageSize.value}
      OFFSET ${offset}
    `)) as { rows?: ThreadCastRow[] };

    const rootAuthor = toAuthor(rootRow);
    const rootOutput = {
      hash: fromHexToCastHash(rootRow.hashHex),
      parentHash: fromHexToCastHash(rootRow.parentHashHex),
      text: asString(rootRow.text) ?? "",
      authorUsername: rootAuthor.username,
      createdAt: toIsoString(rootRow.castTimestamp),
      viewCount: asNumber(rootRow.viewCount) ?? 0,
      author: rootAuthor,
    };

    const replies = (repliesResult.rows ?? []).map((row) => {
      const author = toAuthor(row);
      return {
        hash: fromHexToCastHash(row.hashHex),
        parentHash: fromHexToCastHash(row.parentHashHex),
        text: asString(row.text) ?? "",
        authorUsername: author.username,
        createdAt: toIsoString(row.castTimestamp),
        viewCount: asNumber(row.viewCount) ?? 0,
        author,
      };
    });

    return success(name, {
      root: rootOutput,
      replies,
      replyCount,
      page: effectivePage,
      pageSize: parsedPageSize.value,
      totalPages,
      hasNextPage: effectivePage < totalPages,
      hasPrevPage: effectivePage > 1,
      focusHash,
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `get-discussion-thread request failed: ${formatCobuildAiContextError(error)}`);
  }
}

async function createQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const openAiFetch = createTimeoutFetch({
    timeoutMs: getOpenAiTimeoutMs(),
    name: "OpenAI",
  });

  const response = await openAiFetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_CAST_EMBEDDING_MODEL,
      input: query,
      dimensions: CAST_EMBEDDING_DIMENSIONS,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed with status ${response.status}`);
  }

  let payload: unknown = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new Error("OpenAI embeddings returned invalid JSON.");
  }

  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("OpenAI embeddings response is missing data.");
  }

  const first = payload.data[0];
  if (!isRecord(first) || !Array.isArray(first.embedding)) {
    throw new Error("OpenAI embeddings response is missing embedding values.");
  }

  const embedding = first.embedding
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : 0))
    .slice(0, CAST_EMBEDDING_DIMENSIONS);

  if (embedding.length !== CAST_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `OpenAI embeddings dimension mismatch: expected ${CAST_EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    );
  }

  return embedding;
}

async function executeSemanticSearchCasts(input: unknown): Promise<ToolExecutionResult> {
  const name = "semantic-search-casts";
  const body = asRecord(input);

  if (typeof body.query !== "string") {
    return failure(name, 400, "query must be a string.");
  }
  const query = body.query.trim();
  if (!query) {
    return failure(name, 400, "query must not be empty.");
  }

  const parsedLimit = parseBoundedInteger({
    value: body.limit,
    field: "limit",
    min: SEMANTIC_LIMIT_MIN,
    max: SEMANTIC_LIMIT_MAX,
    defaultValue: DEFAULT_SEMANTIC_LIMIT,
  });
  if (!parsedLimit.ok) {
    return failure(name, 400, parsedLimit.error);
  }

  const rootHash = body.rootHash === undefined ? null : normalizeCastHash(body.rootHash);
  if (body.rootHash !== undefined && !rootHash) {
    return failure(name, 400, "rootHash must be a full cast hash (0x + 40 hex chars).");
  }

  try {
    const embedding = await createQueryEmbedding(query);
    const vectorLiteral = toVectorLiteral(embedding);
    const rootBuffer = rootHash ? castHashToBuffer(rootHash) : null;

    const rootScopeFilter = rootBuffer
      ? sql`AND (c.hash = ${rootBuffer} OR c.root_parent_hash = ${rootBuffer})`
      : sql``;

    const result = (await cobuildDb.execute(sql`
      SELECT
        encode(c.hash, 'hex') AS "hashHex",
        encode(c.parent_hash, 'hex') AS "parentHashHex",
        encode(COALESCE(c.root_parent_hash, c.hash), 'hex') AS "rootHashHex",
        c.text AS "text",
        c.timestamp AS "castTimestamp",
        p.fid AS "authorFid",
        p.fname AS "authorFname",
        p.display_name AS "authorDisplayName",
        p.avatar_url AS "authorAvatarUrl",
        p.neynar_user_score AS "authorNeynarScore",
        (c.text_embedding <=> ${vectorLiteral}::vector) AS "distance"
      FROM farcaster.casts c
      JOIN farcaster.profiles p ON p.fid = c.fid
      WHERE c.deleted_at IS NULL
        AND c.hidden_at IS NULL
        AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
        AND c.text IS NOT NULL
        AND btrim(c.text) <> ''
        AND c.fid IS NOT NULL
        AND c.text_embedding IS NOT NULL
        AND p.hidden_at IS NULL
        AND p.neynar_user_score IS NOT NULL
        AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
        ${rootScopeFilter}
      ORDER BY c.text_embedding <=> ${vectorLiteral}::vector ASC
      LIMIT ${parsedLimit.value}
    `)) as { rows?: SemanticSearchRow[] };

    const items = (result.rows ?? []).map((row) => {
      const distance = asNumber(row.distance) ?? 1;
      const similarity = Math.max(0, Math.min(1, 1 - distance));
      const author = toAuthor(row);
      return {
        hash: fromHexToCastHash(row.hashHex),
        parentHash: fromHexToCastHash(row.parentHashHex),
        rootHash: fromHexToCastHash(row.rootHashHex),
        text: asString(row.text) ?? "",
        authorUsername: author.username,
        createdAt: toIsoString(row.castTimestamp),
        distance,
        similarity,
        author,
      };
    });

    return success(name, {
      query,
      count: items.length,
      items,
      ...(rootHash ? { rootHash } : {}),
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `semantic-search-casts request failed: ${getDocsSearchErrorMessage(error)}`);
  }
}

async function executeReplyToCast(input: unknown): Promise<ToolExecutionResult> {
  const name = "reply-to-cast";
  const body = asRecord(input);

  if (body.confirm !== true) {
    return failure(name, 400, "confirm must be true to publish a reply.");
  }

  const signerUuid = asString(body.signerUuid);
  if (!signerUuid || !SIGNER_UUID_PATTERN.test(signerUuid)) {
    return failure(name, 400, "signerUuid must be a valid UUID.");
  }

  const text = asString(body.text);
  if (!text) {
    return failure(name, 400, "text must not be empty.");
  }
  if (text.length > CAST_CHARACTER_LIMIT) {
    return failure(name, 400, "text is too long for a Farcaster cast.");
  }

  const parentHash = normalizeCastHash(body.parentHash);
  if (!parentHash) {
    return failure(name, 400, "parentHash must be a full cast hash (0x + 40 hex chars).");
  }

  let parentAuthorFid: number | undefined;
  if (body.parentAuthorFid !== undefined) {
    const parsedFid = asInteger(body.parentAuthorFid);
    if (parsedFid === null || parsedFid < 1) {
      return failure(name, 400, "parentAuthorFid must be a positive integer when provided.");
    }
    parentAuthorFid = parsedFid;
  }

  const idem = asString(body.idem) ?? undefined;
  if (idem && idem.length > 128) {
    return failure(name, 400, "idem must be 128 characters or fewer.");
  }

  let embeds: Array<{ url: string }> | undefined;
  if (body.embeds !== undefined) {
    if (!Array.isArray(body.embeds)) {
      return failure(name, 400, "embeds must be an array.");
    }
    if (body.embeds.length > 2) {
      return failure(name, 400, "embeds may include at most 2 URLs.");
    }

    const normalizedEmbeds: Array<{ url: string }> = [];
    for (const entry of body.embeds) {
      if (!isRecord(entry)) {
        return failure(name, 400, "each embed must be an object with a valid url.");
      }
      const normalized = normalizeHttpUrl(entry.url);
      if (!normalized) {
        return failure(name, 400, "each embed url must be a valid http(s) URL.");
      }
      normalizedEmbeds.push({ url: normalized });
    }
    embeds = normalizedEmbeds;
  }

  const apiKey = process.env.NEYNAR_API_KEY?.trim();
  if (!apiKey) {
    return failure(name, 503, "Neynar API key is not configured.");
  }

  try {
    const neynarFetch = createTimeoutFetch({
      timeoutMs: getNeynarTimeoutMs(),
      name: "Neynar",
    });

    const response = await neynarFetch(NEYNAR_CAST_ENDPOINT, {
      method: "POST",
      headers: {
        ...NEYNAR_JSON_HEADERS,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        signer_uuid: signerUuid,
        text,
        parent: parentHash,
        ...(typeof parentAuthorFid === "number" ? { parent_author_fid: parentAuthorFid } : {}),
        ...(idem ? { idem } : {}),
        ...(embeds && embeds.length > 0 ? { embeds } : {}),
      }),
    });

    const responseText = await response.text();
    let payload: NeynarPublishResponse | null = null;
    try {
      payload = responseText ? (JSON.parse(responseText) as NeynarPublishResponse) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.message ?? `Neynar publish failed with status ${response.status}.`;
      const statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
      return failure(name, statusCode, truncate(message, 200));
    }

    const publishedHash = normalizeCastHash(payload?.cast?.hash ?? null);
    if (!payload?.success || !publishedHash) {
      return failure(name, 502, "Unexpected response from Neynar publish API.");
    }

    return success(name, {
      hash: publishedHash,
      cast: payload.cast,
    }, NO_STORE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `reply-to-cast request failed: ${formatCobuildAiContextError(error)}`);
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
    name: "list-discussions",
    aliases: ["listDiscussions", "buildbot.list-discussions"],
    description: "List top-level Cobuild discussion posts with sort and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50 },
        offset: { type: "integer", minimum: 0, maximum: 10000 },
        sort: { type: "string", enum: ["last", "replies", "views"] },
        direction: { type: "string", enum: ["asc", "desc"] },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["items", "hasMore", "limit", "offset", "sort", "direction"],
      properties: {
        items: { type: "array", items: { type: "object" } },
        hasMore: { type: "boolean" },
        limit: { type: "number" },
        offset: { type: "number" },
        sort: { type: "string" },
        direction: { type: "string" },
      },
      additionalProperties: false,
    },
    scopes: ["buildbot-tools", "farcaster", "discussion"],
    sideEffects: "read",
    version: "1.0.0",
    deprecated: false,
    execute: executeListDiscussions,
  },
  {
    name: "get-discussion-thread",
    aliases: ["getDiscussionThread", "buildbot.get-discussion-thread"],
    description: "Get a Cobuild discussion thread with paginated replies and optional focus hash.",
    inputSchema: {
      type: "object",
      required: ["rootHash"],
      properties: {
        rootHash: { type: "string", minLength: 42, maxLength: 42 },
        page: { type: "integer", minimum: 1, maximum: 10000 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        focusHash: { type: "string", minLength: 42, maxLength: 42 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["root", "replies", "replyCount", "page", "pageSize", "totalPages", "hasNextPage", "hasPrevPage"],
      properties: {
        root: { type: "object" },
        replies: { type: "array", items: { type: "object" } },
        replyCount: { type: "number" },
        page: { type: "number" },
        pageSize: { type: "number" },
        totalPages: { type: "number" },
        hasNextPage: { type: "boolean" },
        hasPrevPage: { type: "boolean" },
        focusHash: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
    scopes: ["buildbot-tools", "farcaster", "discussion"],
    sideEffects: "read",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetDiscussionThread,
  },
  {
    name: "semantic-search-casts",
    aliases: ["semanticSearchCasts", "buildbot.semantic-search-casts"],
    description: "Semantic search over Cobuild Farcaster casts using stored pgvector embeddings.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1000 },
        limit: { type: "integer", minimum: 1, maximum: 25 },
        rootHash: { type: "string", minLength: 42, maxLength: 42 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["query", "count", "items"],
      properties: {
        query: { type: "string" },
        count: { type: "number" },
        items: { type: "array", items: { type: "object" } },
        rootHash: { type: "string" },
      },
      additionalProperties: false,
    },
    scopes: ["buildbot-tools", "farcaster", "discussion", "semantic-search"],
    sideEffects: "network-read",
    version: "1.0.0",
    deprecated: false,
    execute: executeSemanticSearchCasts,
  },
  {
    name: "reply-to-cast",
    aliases: ["replyToCast", "buildbot.reply-to-cast"],
    description: "Publish a Farcaster reply to a specific cast hash via Neynar (confirmation required).",
    inputSchema: {
      type: "object",
      required: ["confirm", "signerUuid", "text", "parentHash"],
      properties: {
        confirm: { type: "boolean" },
        signerUuid: { type: "string", minLength: 36, maxLength: 36 },
        text: { type: "string", minLength: 1, maxLength: 1024 },
        parentHash: { type: "string", minLength: 42, maxLength: 42 },
        parentAuthorFid: { type: "integer", minimum: 1 },
        idem: { type: "string", minLength: 1, maxLength: 128 },
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
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["hash", "cast"],
      properties: {
        hash: { type: "string" },
        cast: { type: "object" },
      },
      additionalProperties: true,
    },
    scopes: ["buildbot-tools", "farcaster", "neynar", "write"],
    sideEffects: "network-write",
    version: "1.0.0",
    deprecated: false,
    execute: executeReplyToCast,
  },
  {
    name: "get-treasury-stats",
    aliases: [],
    description: "Fetch cached treasury stats snapshot.",
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
