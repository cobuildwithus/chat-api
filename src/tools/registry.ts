import { eq, sql } from "drizzle-orm";
import { requestContext } from "@fastify/request-context";
import { base, baseSepolia } from "viem/chains";
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  type Address,
} from "viem";
import { z } from "zod";
import { getOpenAiTimeoutMs } from "../config/env";
import { getOrSetCachedResultWithLock } from "../infra/cache/cacheResult";
import { getCobuildAiContextSnapshot } from "../infra/cobuild-ai-context";
import { formatErrorMessage } from "../infra/errors";
import { cobuildDb } from "../infra/db/cobuildDb";
import { farcasterProfiles } from "../infra/db/schema";
import { createTimeoutFetch } from "../infra/http/timeout";

export const NO_STORE_CACHE_CONTROL = "no-store";
export const SHORT_PRIVATE_CACHE_CONTROL = "private, max-age=60";
export const SHORT_PUBLIC_CACHE_CONTROL = "public, max-age=60";

const GET_USER_CACHE_PREFIX = "farcaster:get-user:";
const GET_USER_CACHE_TTL_SECONDS = 60 * 10;

const GET_CAST_CACHE_PREFIX = "cli-tools:get-cast:";
const GET_CAST_CACHE_TTL_SECONDS = 60 * 2;
const GET_WALLET_BALANCES_CACHE_PREFIX = "cli-tools:get-wallet-balances:";
const GET_WALLET_BALANCES_CACHE_TTL_SECONDS = 30;

const OPENAI_VECTOR_STORES_URL = "https://api.openai.com/v1/vector_stores";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_CAST_EMBEDDING_MODEL = "text-embedding-3-small";
const CAST_EMBEDDING_DIMENSIONS = 256;

const DEFAULT_DOCS_SEARCH_LIMIT = 8;
const DOCS_SEARCH_LIMIT_MIN = 1;
const DOCS_SEARCH_LIMIT_MAX = 20;
const DOCS_SEARCH_QUERY_MAX = 1000;
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
const ENABLE_CLI_DOCS_SEARCH_ENV = "ENABLE_CLI_DOCS_SEARCH";
const ENABLE_CLI_GET_CAST_ENV = "ENABLE_CLI_GET_CAST";
const BASE_RPC_URL_ENV = "COBUILD_BASE_RPC_URL";
const BASE_SEPOLIA_RPC_URL_ENV = "COBUILD_BASE_SEPOLIA_RPC_URL";

const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";
const DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const RPC_TIMEOUT_MS = 7_000;
const RPC_RETRY_COUNT = 1;
const USDC_DECIMALS = 6;
const BASE_USDC_CONTRACT = "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913" as Address;
const BASE_SEPOLIA_USDC_CONTRACT = "0x036CbD53842c5426634e7929541eC2318f3dCf7e" as Address;

const ERROR_MAX_LENGTH = 140;
const SNIPPET_MAX_LENGTH = 420;
const EXCERPT_MAX_LENGTH = 280;
const TITLE_MAX_LENGTH = 160;

const CAST_HASH_PATTERN = /^0x[0-9a-fA-F]{40}$/;

class OpenAiConfigError extends Error {}

type JsonSchema = Record<string, unknown>;

type DiscussionSort = "last" | "replies" | "views";
type DiscussionSortDirection = "asc" | "desc";
type WalletBalanceNetwork = "base" | "base-sepolia";

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

type ToolExecute = (input: any) => Promise<ToolExecutionResult>;

type RegisteredTool = ToolMetadata & {
  input: z.ZodTypeAny;
  aliases: string[];
  execute: ToolExecute;
};

type RawRegisteredTool = Omit<RegisteredTool, "inputSchema">;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function truncate(value: string, maxLength = ERROR_MAX_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isFeatureEnabled(envName: string, defaultEnabled = true): boolean {
  const rawValue = process.env[envName];
  if (!rawValue) return defaultEnabled;

  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return defaultEnabled;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return defaultEnabled;
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

function toToolInputSchema(schema: z.ZodTypeAny): JsonSchema {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

function formatToolInputError(toolName: string, error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid tool input.";
  const path = issue.path.map(String);
  const field = path[0];

  if (toolName === "get-user") {
    if (field === "fname" && issue.code === "invalid_type") return "fname must be a string.";
    if (field === "fname" && issue.code === "too_small") return "fname must not be empty.";
  }

  if (toolName === "get-cast") {
    if (field === "identifier" && issue.code === "invalid_type") return "identifier must be a string.";
    if (field === "identifier" && issue.code === "too_small") return "identifier must not be empty.";
    if (field === "type") return 'type must be either "hash" or "url".';
  }

  if (toolName === "cast-preview") {
    if (field === "text" && issue.code === "invalid_type") return "text must be a string.";
    if (field === "text" && issue.code === "too_small") return "text must not be empty.";
    if (field === "embeds" && issue.code === "invalid_type") return "embeds must be an array.";
    if (field === "embeds" && issue.code === "too_big") return "embeds may include at most 2 URLs.";
  }

  if (toolName === "get-wallet-balances") {
    if (field === "agentKey" && issue.code === "invalid_type") return "agentKey must be a string.";
    if (field === "agentKey" && issue.code === "too_small") return "agentKey must not be empty.";
    if (field === "network") return 'network must be either "base" or "base-sepolia".';
  }

  if (toolName === "docs-search") {
    if (field === "query" && issue.code === "invalid_type") return "Query must be a string.";
    if (field === "query" && issue.code === "too_small") return "Query must not be empty.";
    if (field === "query" && issue.code === "too_big") {
      return `Query must be at most ${DOCS_SEARCH_QUERY_MAX} characters.`;
    }
    if (field === "limit" && issue.code === "invalid_type") return "Limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `Limit must be between ${DOCS_SEARCH_LIMIT_MIN} and ${DOCS_SEARCH_LIMIT_MAX}.`;
    }
  }

  if (toolName === "list-discussions") {
    if (field === "limit" && issue.code === "invalid_type") return "limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `limit must be between ${DISCUSSION_LIMIT_MIN} and ${DISCUSSION_LIMIT_MAX}.`;
    }
    if (field === "offset" && issue.code === "invalid_type") return "offset must be an integer.";
    if (field === "offset" && (issue.code === "too_small" || issue.code === "too_big")) {
      return "offset must be between 0 and 10000.";
    }
  }

  if (toolName === "get-discussion-thread") {
    if (field === "rootHash") return "rootHash must be a full cast hash (0x + 40 hex chars).";
    if (field === "focusHash") return "focusHash must be a full cast hash (0x + 40 hex chars).";
    if (field === "page" && issue.code === "invalid_type") return "page must be an integer.";
    if (field === "page" && (issue.code === "too_small" || issue.code === "too_big")) {
      return "page must be between 1 and 10000.";
    }
    if (field === "pageSize" && issue.code === "invalid_type") return "pageSize must be an integer.";
    if (field === "pageSize" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `pageSize must be between ${THREAD_PAGE_SIZE_MIN} and ${THREAD_PAGE_SIZE_MAX}.`;
    }
  }

  if (toolName === "semantic-search-casts") {
    if (field === "query" && issue.code === "invalid_type") return "query must be a string.";
    if (field === "query" && issue.code === "too_small") return "query must not be empty.";
    if (field === "limit" && issue.code === "invalid_type") return "limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `limit must be between ${SEMANTIC_LIMIT_MIN} and ${SEMANTIC_LIMIT_MAX}.`;
    }
    if (field === "rootHash") return "rootHash must be a full cast hash (0x + 40 hex chars).";
  }

  return issue.message || "Invalid tool input.";
}

const castHashInputSchema = z.string().trim().regex(CAST_HASH_PATTERN);
const getUserInputSchema = z.object({
  fname: z.string().trim().min(1).max(64),
}).strict();
const getCastInputSchema = z.object({
  identifier: z.string().trim().min(1).max(2048),
  type: z.enum(["hash", "url"]),
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
  limit: z.number().int().min(1).max(50).default(DEFAULT_DISCUSSION_LIMIT),
  offset: z.number().int().min(0).max(10000).default(0),
  sort: z.enum(["last", "replies", "views"]).default("last"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();
const getDiscussionThreadInputSchema = z.object({
  rootHash: castHashInputSchema,
  page: z.number().int().min(1).max(10000).default(DEFAULT_THREAD_PAGE),
  pageSize: z.number().int().min(1).max(100).default(DEFAULT_THREAD_PAGE_SIZE),
  focusHash: castHashInputSchema.optional(),
}).strict();
const semanticSearchCastsInputSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.number().int().min(1).max(25).default(DEFAULT_SEMANTIC_LIMIT),
  rootHash: castHashInputSchema.optional(),
}).strict();
const getWalletBalancesInputSchema = z.object({
  agentKey: z.string().trim().min(1).max(128).optional(),
  network: z.enum(["base", "base-sepolia"]).default("base"),
}).strict();
const getTreasuryStatsInputSchema = z.object({}).strict();
const docsSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(DOCS_SEARCH_QUERY_MAX),
  limit: z.number().int().min(1).max(20).default(DEFAULT_DOCS_SEARCH_LIMIT),
}).strict();

function getWalletBalanceRpcUrl(network: WalletBalanceNetwork): string {
  const envName = network === "base" ? BASE_RPC_URL_ENV : BASE_SEPOLIA_RPC_URL_ENV;
  const fallback = network === "base" ? DEFAULT_BASE_RPC_URL : DEFAULT_BASE_SEPOLIA_RPC_URL;
  return asString(process.env[envName]) ?? fallback;
}

function getWalletBalanceNetworkConfig(network: WalletBalanceNetwork) {
  if (network === "base-sepolia") {
    return {
      chain: baseSepolia,
      rpcUrl: getWalletBalanceRpcUrl(network),
      usdcAddress: BASE_SEPOLIA_USDC_CONTRACT,
    };
  }
  return {
    chain: base,
    rpcUrl: getWalletBalanceRpcUrl(network),
    usdcAddress: BASE_USDC_CONTRACT,
  };
}

function getToolsPrincipalFromContext(): { ownerAddress: string; agentKey: string } | null {
  try {
    const raw = requestContext.get("toolsPrincipal");
    if (!isRecord(raw)) return null;
    const ownerAddress = asString(raw.ownerAddress);
    const agentKey = asString(raw.agentKey);
    if (!ownerAddress || !agentKey) return null;
    return { ownerAddress, agentKey };
  } catch {
    return null;
  }
}

async function executeGetWalletBalances(
  input: z.infer<typeof getWalletBalancesInputSchema>,
): Promise<ToolExecutionResult> {
  const name = "get-wallet-balances";
  const principal = getToolsPrincipalFromContext();
  if (!principal) {
    return failure(name, 401, "Authenticated tools principal is required to fetch wallet balances.");
  }

  if (input.agentKey && input.agentKey !== principal.agentKey) {
    return failure(
      name,
      403,
      `agentKey mismatch for this token. Expected "${principal.agentKey}".`,
    );
  }

  let walletAddress: Address;
  try {
    walletAddress = getAddress(principal.ownerAddress).toLowerCase() as Address;
  } catch {
    return failure(name, 500, "Authenticated tools principal has an invalid owner address.");
  }

  const agentKey = input.agentKey ?? principal.agentKey;
  const network = input.network;
  const { chain, rpcUrl, usdcAddress } = getWalletBalanceNetworkConfig(network);

  try {
    const cachedOutput = await getOrSetCachedResultWithLock(
      `${network}:${walletAddress}`,
      GET_WALLET_BALANCES_CACHE_PREFIX,
      async () => {
        const client = createPublicClient({
          chain,
          transport: http(rpcUrl, {
            timeout: RPC_TIMEOUT_MS,
            retryCount: RPC_RETRY_COUNT,
          }),
        });

        const [ethBalanceWei, usdcBalanceRaw] = await Promise.all([
          client.getBalance({ address: walletAddress }),
          client.readContract({
            address: usdcAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
          }),
        ]);

        return {
          network,
          walletAddress,
          balances: {
            eth: {
              wei: ethBalanceWei.toString(),
              formatted: formatEther(ethBalanceWei),
            },
            usdc: {
              raw: usdcBalanceRaw.toString(),
              decimals: USDC_DECIMALS,
              formatted: formatUnits(usdcBalanceRaw, USDC_DECIMALS),
              contract: usdcAddress,
            },
          },
        };
      },
      GET_WALLET_BALANCES_CACHE_TTL_SECONDS,
    );

    return success(
      name,
      {
        agentKey,
        ...cachedOutput,
      },
      SHORT_PRIVATE_CACHE_CONTROL,
    );
  } catch (error) {
    return failure(name, 502, `get-wallet-balances request failed: ${formatErrorMessage(error)}`);
  }
}

function toVectorLiteral(vector: number[]): string {
  const sanitized = vector.map((value) => (Number.isFinite(value) ? value : 0));
  return `[${sanitized.join(",")}]`;
}

async function executeGetUser(input: unknown): Promise<ToolExecutionResult> {
  const name = "get-user";
  const body = input as z.infer<typeof getUserInputSchema>;
  const fname = body.fname.toLowerCase();

  try {
    const cacheKey = fname;
    const result = await getOrSetCachedResultWithLock(
      cacheKey,
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
  } catch (error) {
    return failure(name, 502, `get-user request failed: ${formatErrorMessage(error)}`);
  }
}

async function executeGetCast(input: z.infer<typeof getCastInputSchema>): Promise<ToolExecutionResult> {
  const name = "get-cast";
  if (!isFeatureEnabled(ENABLE_CLI_GET_CAST_ENV, true)) {
    return failure(name, 403, "This tool is disabled.");
  }

  const identifier = input.identifier.trim();
  const type = input.type;
  if (type !== "hash") {
    return failure(name, 400, "URL lookup is no longer supported. Provide a full cast hash (0x + 40 hex chars).");
  }

  const hash = normalizeCastHash(identifier);
  if (!hash) {
    return failure(name, 400, "identifier must be a full cast hash (0x + 40 hex chars).");
  }

  try {
    const cacheKey = `${type}:${hash}`;
    const cast = await getOrSetCachedResultWithLock(
      cacheKey,
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
      return failure(name, 404, "Cast not found.");
    }

    return success(name, cast, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `get-cast request failed: ${formatErrorMessage(error)}`);
  }
}

async function executeCastPreview(input: z.infer<typeof castPreviewInputSchema>): Promise<ToolExecutionResult> {
  const name = "cast-preview";
  const text = input.text;
  const embeds = input.embeds;
  const parent = input.parent;
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
      `get-treasury-stats request failed: ${formatErrorMessage(error)}`,
    );
  }
}

async function executeDocsSearch(input: z.infer<typeof docsSearchInputSchema>): Promise<ToolExecutionResult> {
  const name = "docs-search";
  if (!isFeatureEnabled(ENABLE_CLI_DOCS_SEARCH_ENV, true)) {
    return failure(name, 403, "This tool is disabled.");
  }

  const vectorStoreId = process.env.DOCS_VECTOR_STORE_ID?.trim();
  if (!vectorStoreId) {
    return failure(name, 503, "Docs search is not configured (missing DOCS_VECTOR_STORE_ID).");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return failure(name, 503, "Docs search is not configured (missing OPENAI_API_KEY).");
  }

  const query = input.query;
  const limit = input.limit;

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
    }, NO_STORE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `Docs search request failed: ${getDocsSearchErrorMessage(error)}`);
  }
}

async function executeListDiscussions(
  input: z.infer<typeof listDiscussionsInputSchema>,
): Promise<ToolExecutionResult> {
  const name = "list-discussions";
  const { limit, offset, sort, direction } = input;
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
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `)) as { rows?: DiscussionListRow[] };

    const rows = result.rows ?? [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

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
      limit,
      offset,
      sort,
      direction,
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `list-discussions request failed: ${formatErrorMessage(error)}`);
  }
}

async function executeGetDiscussionThread(
  input: z.infer<typeof getDiscussionThreadInputSchema>,
): Promise<ToolExecutionResult> {
  const name = "get-discussion-thread";
  const rootHash = input.rootHash.toLowerCase();
  const focusHash = input.focusHash ? input.focusHash.toLowerCase() : null;
  const requestedPage = input.page;
  const pageSize = input.pageSize;

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
    const totalPages = Math.max(1, Math.ceil(replyCount / pageSize));

    let effectivePage = Math.max(1, Math.min(requestedPage, totalPages));
    if (focusHash && focusHash !== rootHash) {
      const focusBuffer = castHashToBuffer(focusHash);
      const focusResult = (await cobuildDb.execute(sql`
        SELECT
          c.timestamp AS "focusTimestamp",
          encode(c.hash, 'hex') AS "focusHashHex"
        FROM farcaster.casts c
        JOIN farcaster.profiles p ON p.fid = c.fid
        WHERE c.deleted_at IS NULL
          AND c.hidden_at IS NULL
          AND c.root_parent_hash = ${rootBuffer}
          AND c.hash <> ${rootBuffer}
          AND c.hash = ${focusBuffer}
          AND c.root_parent_url = ${DISCUSSION_CHANNEL_URL}
          AND c.text IS NOT NULL
          AND btrim(c.text) <> ''
          AND c.fid IS NOT NULL
          AND p.hidden_at IS NULL
          AND p.neynar_user_score IS NOT NULL
          AND p.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
        LIMIT 1
      `)) as { rows?: Array<{ focusTimestamp?: Date | string | null; focusHashHex?: string | null }> };

      const focusRow = focusResult.rows?.[0];
      if (focusRow?.focusHashHex && focusRow.focusTimestamp) {
        const beforeResult = (await cobuildDb.execute(sql`
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
            AND (
              c.timestamp < ${focusRow.focusTimestamp}
              OR (c.timestamp = ${focusRow.focusTimestamp} AND c.hash < ${focusBuffer})
            )
        `)) as { rows?: Array<{ count?: string | number | null }> };

        const beforeCount = asNumber(beforeResult.rows?.[0]?.count) ?? 0;
        effectivePage = Math.max(1, Math.min(Math.floor(beforeCount / pageSize) + 1, totalPages));
      }
    }

    const offset = (effectivePage - 1) * pageSize;
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
      LIMIT ${pageSize}
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
      pageSize,
      totalPages,
      hasNextPage: effectivePage < totalPages,
      hasPrevPage: effectivePage > 1,
      focusHash,
    }, SHORT_PRIVATE_CACHE_CONTROL);
  } catch (error) {
    return failure(name, 502, `get-discussion-thread request failed: ${formatErrorMessage(error)}`);
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
): Promise<ToolExecutionResult> {
  const name = "semantic-search-casts";
  const query = input.query;
  const limit = input.limit;
  const rootHash = input.rootHash ? input.rootHash.toLowerCase() : null;

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
      LIMIT ${limit}
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
    const message = getDocsSearchErrorMessage(error);
    return failure(
      name,
      error instanceof OpenAiConfigError ? 503 : 502,
      `semantic-search-casts request failed: ${message}`,
    );
  }
}

const RAW_TOOL_DEFINITIONS: RawRegisteredTool[] = [
  {
    name: "get-user",
    aliases: ["getUser", "cli.get-user"],
    description:
      "Get Farcaster profile details by fname, with exact match first and fuzzy fallback.",
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
    sideEffects: "read",
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
    sideEffects: "read",
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
    sideEffects: "read",
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
    sideEffects: "read",
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
    sideEffects: "network-read",
    version: "1.0.0",
    deprecated: false,
    execute: executeSemanticSearchCasts,
  },
  {
    name: "get-wallet-balances",
    aliases: ["getWalletBalances", "walletBalances"],
    description: "Fetch ETH and USDC balances for the authenticated CLI wallet.",
    input: getWalletBalancesInputSchema,
    outputSchema: {
      type: "object",
      required: ["agentKey", "network", "walletAddress", "balances"],
      properties: {
        agentKey: { type: "string" },
        network: { type: "string" },
        walletAddress: { type: "string" },
        balances: {
          type: "object",
          required: ["eth", "usdc"],
          properties: {
            eth: {
              type: "object",
              required: ["wei", "formatted"],
              properties: {
                wei: { type: "string" },
                formatted: { type: "string" },
              },
              additionalProperties: false,
            },
            usdc: {
              type: "object",
              required: ["raw", "decimals", "formatted", "contract"],
              properties: {
                raw: { type: "string" },
                decimals: { type: "number" },
                formatted: { type: "string" },
                contract: { type: "string" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "wallet"],
    sideEffects: "network-read",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetWalletBalances,
  },
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
    sideEffects: "network-read",
    version: "1.0.0",
    deprecated: false,
    execute: executeCobuildAiContext,
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
    version: "1.0.0",
    deprecated: false,
    execute: executeDocsSearch,
  },
];

const TOOL_DEFINITIONS: RegisteredTool[] = RAW_TOOL_DEFINITIONS.map((tool) => ({
  ...tool,
  inputSchema: toToolInputSchema(tool.input),
}));

function normalizeToolLookupKey(name: string): string {
  return name.trim().toLowerCase();
}

const TOOL_LOOKUP = new Map<string, RegisteredTool>();
for (const tool of TOOL_DEFINITIONS) {
  for (const key of [tool.name, ...tool.aliases]) {
    const normalizedKey = normalizeToolLookupKey(key);
    /* c8 ignore next 3 -- registration collisions are prevented by static literals */
    if (TOOL_LOOKUP.has(normalizedKey)) {
      throw new Error(`Duplicate tool registration for key "${key}"`);
    }
    TOOL_LOOKUP.set(normalizedKey, tool);
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
  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(name));
  if (!tool) {
    return null;
  }
  return toMetadata(tool);
}

export function requiresWriteScopeForTool(name: string): boolean {
  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(name));
  if (!tool) return false;
  return tool.scopes.includes("write") || tool.sideEffects === "network-write";
}

export async function executeTool(name: string, input: unknown): Promise<ToolExecutionResult> {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return failure("", 400, "Tool name must not be empty.");
  }

  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(normalizedName));
  if (!tool) {
    return failure(normalizedName, 404, `Unknown tool "${normalizedName}".`);
  }

  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return failure(tool.name, 400, formatToolInputError(tool.name, parsed.error));
  }

  const result = await tool.execute(parsed.data);
  return { ...result, name: tool.name };
}
