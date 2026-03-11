import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { farcasterProfiles } from "../../infra/db/schema";
import { getOpenAiTimeoutMs } from "../../config/env";
import { getOrSetCachedResultWithLock } from "../../infra/cache/cacheResult";
import { createTimeoutFetch } from "../../infra/http/timeout";
import {
  NO_STORE_CACHE_CONTROL,
  SHORT_PRIVATE_CACHE_CONTROL,
  failureFromPublicError,
  success,
} from "./runtime";
import type { RawRegisteredTool } from "./types";
import {
  asNumber,
  asString,
  isFeatureEnabled,
  isRecord,
  normalizeHttpUrl,
  toIsoString,
} from "./utils";

type DiscussionSort = "last" | "replies" | "views";
type DiscussionSortDirection = "asc" | "desc";

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

type GetCastRow = {
  hashHex: string;
  parentHashHex: string | null;
  rootHashHex: string;
  rootParentUrl: string | null;
  text: string | null;
  castTimestamp: Date | string | null;
  replyCount: string | number | null;
  viewCount: string | number | null;
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

const GET_USER_CACHE_PREFIX = "farcaster:get-user:";
const GET_USER_CACHE_TTL_SECONDS = 60 * 10;
const GET_CAST_CACHE_PREFIX = "cli-tools:get-cast:";
const GET_CAST_CACHE_TTL_SECONDS = 60 * 2;
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_CAST_EMBEDDING_MODEL = "text-embedding-3-small";
const CAST_EMBEDDING_DIMENSIONS = 256;
const DEFAULT_DISCUSSION_LIMIT = 20;
const DEFAULT_THREAD_PAGE = 1;
const DEFAULT_THREAD_PAGE_SIZE = 20;
const DEFAULT_SEMANTIC_LIMIT = 12;
const ENABLE_CLI_GET_CAST_ENV = "ENABLE_CLI_GET_CAST";
const SNIPPET_MAX_LENGTH = 420;
const EXCERPT_MAX_LENGTH = 280;
const TITLE_MAX_LENGTH = 160;
const CAST_HASH_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const VISIBLE_DISCUSSION_TEXT_FROM_SQL = sql`
  FROM cobuild.visible_discussion_text_casts c
  JOIN cobuild.visible_discussion_profiles p ON p.fid = c.fid
`;

class OpenAiConfigError extends Error {}

const castHashInputSchema = z.string().trim().regex(CAST_HASH_PATTERN);
const getUserInputSchema = z.object({
  fname: z.string().trim().min(1).max(64),
}).strict();

const getCastInputSchema = z.object({
  identifier: z.string().trim().min(1).max(2048),
  type: z.enum(["hash", "url"]).default("hash"),
}).strict();

const castPreviewInputSchema = z.object({
  text: z.string().trim().min(1).max(1024),
  embeds: z.array(
    z.object({
      url: z.string().trim().min(1).max(2048).refine((value) => normalizeHttpUrl(value) !== null),
    }).strict(),
  ).max(2).optional(),
  parent: z.string().trim().min(1).max(512).optional(),
}).strict();

const listDiscussionsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(DEFAULT_DISCUSSION_LIMIT)
    .describe("Maximum number of discussion roots to return."),
  offset: z.number().int().min(0).max(10000).default(0),
  sort: z.enum(["last", "replies", "views"]).default("last"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();

const getDiscussionThreadInputSchema = z.object({
  rootHash: castHashInputSchema,
  page: z.number().int().min(1).max(10000).default(DEFAULT_THREAD_PAGE),
  pageSize: z.number().int().min(1).max(100).default(DEFAULT_THREAD_PAGE_SIZE),
  focusHash: castHashInputSchema.optional().describe("Optional reply hash to center pagination around."),
}).strict();

const semanticSearchCastsInputSchema = z.object({
  query: z.string().trim().min(1).max(1000).describe("Natural-language query for semantic matching."),
  limit: z.number().int().min(1).max(25).default(DEFAULT_SEMANTIC_LIMIT),
  rootHash: castHashInputSchema.optional(),
}).strict();

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

function toVectorLiteral(vector: number[]): string {
  const sanitized = vector.map((value) => (Number.isFinite(value) ? value : 0));
  return `[${sanitized.join(",")}]`;
}

async function executeGetUser(input: z.infer<typeof getUserInputSchema>) {
  const name = "get-user";
  const fname = input.fname.toLowerCase();

  try {
    const result = await getOrSetCachedResultWithLock(
      fname,
      GET_USER_CACHE_PREFIX,
      async () => {
        const user = await cobuildDb
          .select({
            fid: farcasterProfiles.fid,
            fname: farcasterProfiles.fname,
            addresses: farcasterProfiles.verifiedAddresses,
          })
          .from(farcasterProfiles)
          .where(eq(farcasterProfiles.fname, fname))
          .limit(1)
          .then((rows) => rows[0]);

        if (!user) {
          if (fname.length < 3) {
            return { usedLikeQuery: false, users: [] };
          }

          const users = await cobuildDb
            .select({
              fid: farcasterProfiles.fid,
              fname: farcasterProfiles.fname,
              addresses: farcasterProfiles.verifiedAddresses,
            })
            .from(farcasterProfiles)
            .where(sql`${farcasterProfiles.fname} ILIKE ${`%${fname}%`}`)
            .limit(20);
          return {
            usedLikeQuery: true,
            users: users.map((entry) => ({
              fid: entry.fid,
              fname: entry.fname,
              addresses: entry.addresses ?? (entry as { verifiedAddresses?: string[] }).verifiedAddresses ?? [],
            })),
          };
        }

        return {
          fid: user.fid,
          fname: user.fname,
          addresses: user.addresses ?? (user as { verifiedAddresses?: string[] }).verifiedAddresses ?? [],
        };
      },
      GET_USER_CACHE_TTL_SECONDS,
    );

    return success(name, result, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetCast(input: z.infer<typeof getCastInputSchema>) {
  const name = "get-cast";
  if (!isFeatureEnabled(ENABLE_CLI_GET_CAST_ENV, true)) {
    return failureFromPublicError(name, "toolDisabled");
  }

  if (input.type !== "hash") {
    return failureFromPublicError(name, "toolCastUrlUnsupported");
  }

  const hash = normalizeCastHash(input.identifier);
  if (!hash) {
    return failureFromPublicError(name, "toolCastHashRequired");
  }

  try {
    const cast = await getOrSetCachedResultWithLock(
      `${input.type}:${hash}`,
      GET_CAST_CACHE_PREFIX,
      async () => {
        const hashBuffer = castHashToBuffer(hash);
        const result = (await cobuildDb.execute(sql`
          SELECT
            encode(c.hash, 'hex') AS "hashHex",
            encode(c.parent_hash, 'hex') AS "parentHashHex",
            encode(COALESCE(c.root_parent_hash, c.hash), 'hex') AS "rootHashHex",
            c.root_parent_url AS "rootParentUrl",
            c.text AS "text",
            c.timestamp AS "castTimestamp",
            c.reply_count AS "replyCount",
            c.view_count AS "viewCount",
            p.fid AS "authorFid",
            p.fname AS "authorFname",
            p.display_name AS "authorDisplayName",
            p.avatar_url AS "authorAvatarUrl",
            p.neynar_user_score AS "authorNeynarScore"
          FROM farcaster.casts c
          LEFT JOIN farcaster.profiles p ON p.fid = c.fid
          WHERE c.hash = ${hashBuffer}
            AND c.deleted_at IS NULL
            AND c.hidden_at IS NULL
          LIMIT 1
        `)) as { rows?: GetCastRow[] };

        const row = result.rows?.[0] ?? null;
        if (!row) {
          return null;
        }

        const author = toAuthor(row);
        return {
          hash: fromHexToCastHash(row.hashHex) ?? hash,
          parentHash: fromHexToCastHash(row.parentHashHex),
          rootHash: fromHexToCastHash(row.rootHashHex) ?? hash,
          rootParentUrl: row.rootParentUrl,
          text: asString(row.text) ?? "",
          authorUsername: author.username,
          createdAt: toIsoString(row.castTimestamp),
          replyCount: asNumber(row.replyCount) ?? 0,
          viewCount: asNumber(row.viewCount) ?? 0,
          author,
        };
      },
      GET_CAST_CACHE_TTL_SECONDS,
    );

    if (!cast) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Cast" });
    }

    return success(name, cast, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeCastPreview(input: z.infer<typeof castPreviewInputSchema>) {
  const name = "cast-preview";
  return success(
    name,
    {
      text: input.text,
      ...(input.embeds ? { embeds: input.embeds } : {}),
      ...(input.parent ? { parent: input.parent } : {}),
    },
    NO_STORE_CACHE_CONTROL,
  );
}

async function executeListDiscussions(
  input: z.infer<typeof listDiscussionsInputSchema>,
) {
  const name = "list-discussions";
  const orderBy = toDiscussionOrderBy(input.sort, input.direction);

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
      ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
      LEFT JOIN farcaster.profiles lr ON lr.fid = c.last_reply_fid AND lr.hidden_at IS NULL
      WHERE c.parent_hash IS NULL
      ORDER BY ${orderBy}
      LIMIT ${input.limit + 1}
      OFFSET ${input.offset}
    `)) as { rows?: DiscussionListRow[] };

    const rows = result.rows ?? [];
    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

    const items = pageRows.map((row) => {
      const text = asString(row.text) ?? "";
      const author = toAuthor(row);
      return {
        hash: fromHexToCastHash(row.hashHex),
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
      limit: input.limit,
      offset: input.offset,
      sort: input.sort,
      direction: input.direction,
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetDiscussionThread(
  input: z.infer<typeof getDiscussionThreadInputSchema>,
) {
  const name = "get-discussion-thread";
  const rootHash = input.rootHash.toLowerCase();
  const focusHash = input.focusHash ? input.focusHash.toLowerCase() : null;
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
      ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
      WHERE c.hash = ${rootBuffer}
        AND c.parent_hash IS NULL
      LIMIT 1
    `)) as { rows?: ThreadCastRow[] };

    const rootRow = rootResult.rows?.[0] ?? null;
    if (!rootRow) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Discussion thread" });
    }

    const countResult = (await cobuildDb.execute(sql`
      SELECT COUNT(*)::bigint AS count
      ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
      WHERE c.root_parent_hash = ${rootBuffer}
        AND c.hash <> ${rootBuffer}
    `)) as { rows?: Array<{ count?: string | number | null }> };

    const replyCount = asNumber(countResult.rows?.[0]?.count) ?? 0;
    const totalPages = Math.max(1, Math.ceil(replyCount / input.pageSize));
    let effectivePage = Math.max(1, Math.min(input.page, totalPages));

    if (focusHash && focusHash !== rootHash) {
      const focusBuffer = castHashToBuffer(focusHash);
      const focusResult = (await cobuildDb.execute(sql`
        SELECT
          c.timestamp AS "focusTimestamp",
          encode(c.hash, 'hex') AS "focusHashHex"
        ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
        WHERE c.root_parent_hash = ${rootBuffer}
          AND c.hash <> ${rootBuffer}
          AND c.hash = ${focusBuffer}
        LIMIT 1
      `)) as { rows?: Array<{ focusTimestamp?: Date | string | null; focusHashHex?: string | null }> };

      const focusRow = focusResult.rows?.[0];
      if (focusRow?.focusHashHex && focusRow.focusTimestamp) {
        const beforeResult = (await cobuildDb.execute(sql`
          SELECT COUNT(*)::bigint AS count
          ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
          WHERE c.root_parent_hash = ${rootBuffer}
            AND c.hash <> ${rootBuffer}
            AND (
              c.timestamp < ${focusRow.focusTimestamp}
              OR (c.timestamp = ${focusRow.focusTimestamp} AND c.hash < ${focusBuffer})
            )
        `)) as { rows?: Array<{ count?: string | number | null }> };

        const beforeCount = asNumber(beforeResult.rows?.[0]?.count) ?? 0;
        effectivePage = Math.max(1, Math.min(Math.floor(beforeCount / input.pageSize) + 1, totalPages));
      }
    }

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
      ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
      WHERE c.root_parent_hash = ${rootBuffer}
        AND c.hash <> ${rootBuffer}
      ORDER BY c.timestamp ASC NULLS LAST, c.hash ASC
      LIMIT ${input.pageSize}
      OFFSET ${(effectivePage - 1) * input.pageSize}
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
      pageSize: input.pageSize,
      totalPages,
      hasNextPage: effectivePage < totalPages,
      hasPrevPage: effectivePage > 1,
      focusHash,
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function createQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAiConfigError("OPENAI_API_KEY is not configured.");
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

async function executeSemanticSearchCasts(
  input: z.infer<typeof semanticSearchCastsInputSchema>,
) {
  const name = "semantic-search-casts";
  const rootHash = input.rootHash ? input.rootHash.toLowerCase() : null;

  try {
    const embedding = await createQueryEmbedding(input.query);
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
      ${VISIBLE_DISCUSSION_TEXT_FROM_SQL}
      WHERE c.text_embedding IS NOT NULL
        ${rootScopeFilter}
      ORDER BY c.text_embedding <=> ${vectorLiteral}::vector ASC
      LIMIT ${input.limit}
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
      query: input.query,
      count: items.length,
      items,
      ...(rootHash ? { rootHash } : {}),
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failureFromPublicError(
      name,
      error instanceof OpenAiConfigError ? "toolUnavailable" : "toolExecutionFailed",
    );
  }
}

export const farcasterToolDefinitions: RawRegisteredTool[] = [
  {
    name: "get-user",
    aliases: ["getUser", "cli.get-user"],
    description: "Get Farcaster profile details by fname, with exact match first and fuzzy fallback.",
    input: getUserInputSchema,
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
    scopes: ["cli-tools", "farcaster"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetUser,
  },
  {
    name: "get-cast",
    aliases: ["getCast", "cli.get-cast"],
    description: "Get cast details from Cobuild Farcaster tables by cast hash.",
    input: getCastInputSchema,
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    scopes: ["cli-tools", "farcaster"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetCast,
  },
  {
    name: "cast-preview",
    aliases: ["castPreview", "cli.cast-preview"],
    description: "Normalize cast preview payload for downstream publishing flow.",
    input: castPreviewInputSchema,
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
    scopes: ["cli-tools"],
    sideEffects: "none",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeCastPreview,
  },
  {
    name: "list-discussions",
    aliases: ["listDiscussions", "cli.list-discussions"],
    description: "List top-level Cobuild discussion posts with sort and pagination.",
    input: listDiscussionsInputSchema,
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
    scopes: ["cli-tools", "farcaster", "discussion"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeListDiscussions,
  },
  {
    name: "get-discussion-thread",
    aliases: ["getDiscussionThread", "cli.get-discussion-thread"],
    description: "Get a Cobuild discussion thread with paginated replies and optional focus hash.",
    input: getDiscussionThreadInputSchema,
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
    scopes: ["cli-tools", "farcaster", "discussion"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetDiscussionThread,
  },
  {
    name: "semantic-search-casts",
    aliases: ["semanticSearchCasts", "cli.semantic-search-casts"],
    description: "Semantic search over Cobuild Farcaster casts using stored pgvector embeddings.",
    input: semanticSearchCastsInputSchema,
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
    scopes: ["cli-tools", "farcaster", "discussion", "semantic-search"],
    exposure: "chat-safe",
    sideEffects: "network-read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeSemanticSearchCasts,
  },
];
