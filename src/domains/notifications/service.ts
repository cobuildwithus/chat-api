import { sql } from "drizzle-orm";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { buildProtocolNotificationPresentation } from "./presentation";
import {
  decodeWalletNotificationsCursor,
  encodeWalletNotificationsCursor,
} from "./cursor";
import {
  type ListWalletNotificationsInput,
  type ListWalletNotificationsOutput,
  type NotificationKind,
  type WalletNotificationItem,
  type WalletNotificationsCursor,
  type WalletNotificationsUnreadState,
} from "./types";
import { resolveSubjectWalletFromContext } from "./wallet-subject";

const NEYNAR_SCORE_THRESHOLD = 0.55;
const ISO_UTC_MICROS_TEMPLATE = `YYYY-MM-DD"T"HH24:MI:SS.US"Z"`;

type NotificationRow = {
  id: bigint | number | string;
  kind: string;
  reason: string;
  eventAtCursor: string | null;
  createdAtCursor: string;
  isUnread: boolean;
  sourceType: string;
  sourceId: string;
  sourceHashHex: string | null;
  rootHashHex: string | null;
  targetHashHex: string | null;
  actorFid: bigint | number | null;
  actorWalletAddress: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  sourceText: string | null;
  rootText: string | null;
  payload: unknown;
};

type UnreadRow = {
  count: bigint | number | string | null;
  watermark: string | null;
};

export class WalletNotificationsSubjectRequiredError extends Error {
  constructor() {
    super("Authenticated subject wallet is required.");
  }
}

export class InvalidWalletNotificationsCursorError extends Error {
  constructor() {
    super("cursor must be a valid notifications cursor.");
  }
}

function columnRef(alias: string, column: string) {
  return sql.raw(`${alias}.${column}`);
}

function buildHasAttachmentSql(alias: string) {
  const embedSummaries = columnRef(alias, "embed_summaries");
  const embedsArray = columnRef(alias, "embeds_array");

  return sql`(
    COALESCE(array_length(${embedSummaries}, 1), 0) > 0
    OR (${embedsArray} IS NOT NULL AND jsonb_path_exists(${embedsArray}, '$[*] ? (@.url != null)'))
  )`;
}

function buildRenderableCastSql(alias: string) {
  const text = columnRef(alias, "text");
  const mentionedFids = columnRef(alias, "mentioned_fids");

  return sql`(
    (${text} IS NOT NULL AND btrim(${text}) <> '')
    OR COALESCE(array_length(${mentionedFids}, 1), 0) > 0
    OR ${buildHasAttachmentSql(alias)}
  )`;
}

const NOTIFICATION_FROM_SQL = sql`
  FROM cobuild.notifications notification
  LEFT JOIN cobuild.notification_state state
    ON state.owner_address = notification.recipient_wallet_address
  LEFT JOIN farcaster.casts source
    ON source.hash = notification.source_cast_hash
  LEFT JOIN farcaster.casts root
    ON root.hash = notification.root_cast_hash
  LEFT JOIN farcaster.casts target
    ON target.hash = notification.target_cast_hash
  LEFT JOIN farcaster.profiles actor
    ON actor.fid = notification.actor_fid
  LEFT JOIN farcaster.profiles root_author
    ON root_author.fid = root.fid
`;

function buildVisibleNotificationFilters(subjectWalletAddress: string) {
  return [
    sql`notification.recipient_wallet_address = ${subjectWalletAddress}`,
    sql`notification.invalidated_at IS NULL`,
    sql`(
      notification.kind <> 'discussion'
      OR (
        source.hash IS NOT NULL
        AND source.deleted_at IS NULL
        AND source.hidden_at IS NULL
        AND ${buildRenderableCastSql("source")}
        AND root.hash IS NOT NULL
        AND root.deleted_at IS NULL
        AND root.hidden_at IS NULL
        AND ${buildRenderableCastSql("root")}
        AND root_author.fid IS NOT NULL
        AND root_author.hidden_at IS NULL
        AND root_author.neynar_user_score IS NOT NULL
        AND root_author.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
        AND actor.fid IS NOT NULL
        AND actor.hidden_at IS NULL
        AND actor.neynar_user_score IS NOT NULL
        AND actor.neynar_user_score >= ${NEYNAR_SCORE_THRESHOLD}
        AND (
          notification.reason <> 'reply_to_reply'
          OR (
            target.hash IS NOT NULL
            AND target.deleted_at IS NULL
            AND target.hidden_at IS NULL
            AND ${buildRenderableCastSql("target")}
          )
        )
      )
    )`,
  ];
}

function joinFilters(filters: ReturnType<typeof buildVisibleNotificationFilters>) {
  return sql.join(filters, sql` AND `);
}

function buildIsoTimestampSql(alias: string, column: string) {
  const value = columnRef(alias, column);
  return sql`to_char(${value} AT TIME ZONE 'UTC', ${ISO_UTC_MICROS_TEMPLATE})`;
}

function buildTimestampMicrosSql(alias: string, column: string) {
  const value = columnRef(alias, column);
  return sql`(
    (
      floor(extract(epoch from ${value}))::bigint * 1000000
    ) + (
      floor(extract(microseconds from ${value}))::bigint % 1000000
    )
  )`;
}

function toHash(value: string | null): string | null {
  return value ? `0x${value}` : null;
}

function toCount(value: bigint | number | string | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNumericString(value: bigint | number | string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Math.trunc(value).toString();
  return value;
}

function toTitle(text: string | null | undefined): string | null {
  if (!text) return null;
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  return firstLine.length <= 160 ? firstLine : `${firstLine.slice(0, 157)}...`;
}

function toExcerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

function toPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function buildDiscussionAppPath(row: NotificationRow): string | null {
  if (row.kind !== "discussion") {
    return null;
  }

  const sourceHash = toHash(row.sourceHashHex);
  const rootHash = toHash(row.rootHashHex);
  if (!sourceHash) {
    return null;
  }
  if (!rootHash || sourceHash === rootHash) {
    return `/cast/${sourceHash}`;
  }
  return `/cast/${rootHash}?post=${sourceHash}`;
}

function mapNotificationRow(row: NotificationRow): WalletNotificationItem {
  const payload = toPayload(row.payload);
  const protocolPresentation =
    row.kind === "protocol"
      ? buildProtocolNotificationPresentation({
          reason: row.reason,
          payload,
          actorWalletAddress: row.actorWalletAddress
        })
      : null;
  const actorName =
    protocolPresentation?.actorName ??
    row.actorDisplayName ??
    row.actorUsername ??
    (row.actorFid != null ? `fid:${toCount(row.actorFid)}` : null);

  return {
    id: toNumericString(row.id),
    kind: row.kind,
    reason: row.reason,
    eventAt: row.eventAtCursor,
    createdAt: row.createdAtCursor,
    isUnread: row.isUnread,
    actor:
      row.actorFid != null ||
      row.actorWalletAddress !== null ||
      row.actorUsername !== null ||
      row.actorDisplayName !== null ||
      row.actorAvatarUrl !== null
        ? {
            fid: row.actorFid == null ? null : toCount(row.actorFid),
            walletAddress: row.actorWalletAddress,
            name: actorName,
            username: row.actorUsername,
            avatarUrl: row.actorAvatarUrl,
          }
        : null,
    summary: {
      title: protocolPresentation?.title ?? toTitle(row.rootText ?? row.sourceText),
      excerpt: protocolPresentation?.excerpt ?? toExcerpt(row.sourceText),
    },
    resource: {
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceHash: toHash(row.sourceHashHex),
      rootHash: toHash(row.rootHashHex),
      targetHash: toHash(row.targetHashHex),
      appPath: protocolPresentation?.appPath ?? buildDiscussionAppPath(row),
    },
    payload,
  };
}

async function getUnreadState(
  subjectWalletAddress: string,
  kinds: NotificationKind[] | undefined,
): Promise<WalletNotificationsUnreadState> {
  const filters = buildVisibleNotificationFilters(subjectWalletAddress);
  const kindsFilter = resolveKindsFilter(kinds);
  if (kindsFilter) {
    filters.push(kindsFilter);
  }
  filters.push(sql`(
    state.last_read_at IS NULL
    OR notification.created_at > state.last_read_at
  )`);

  const result = (await cobuildPrimaryDb().execute(sql`
    SELECT
      COUNT(*)::bigint AS count,
      COALESCE(
        (MAX(${buildTimestampMicrosSql("notification", "created_at")}))::bigint::text,
        '0'
      ) AS watermark
    ${NOTIFICATION_FROM_SQL}
    WHERE ${joinFilters(filters)}
  `)) as { rows?: UnreadRow[] };

  const row = result.rows?.[0];
  return {
    count: toCount(row?.count),
    watermark: row?.watermark ?? "0",
  };
}

function resolveCursor(input: ListWalletNotificationsInput): WalletNotificationsCursor | null {
  if (!input.cursor) {
    return null;
  }

  const decoded = decodeWalletNotificationsCursor(input.cursor);
  if (!decoded) {
    throw new InvalidWalletNotificationsCursorError();
  }
  return decoded;
}

function resolveKindsFilter(kinds: NotificationKind[] | undefined) {
  if (!kinds || kinds.length === 0) {
    return null;
  }

  return sql`notification.kind IN (${sql.join(kinds.map((kind) => sql`${kind}`), sql`, `)})`;
}

function buildCursorFilter(cursor: WalletNotificationsCursor) {
  const createdAt = sql`${cursor.createdAt}::timestamptz`;
  const id = BigInt(cursor.id);

  if (cursor.eventAt === null) {
    return sql`(
      notification.event_at IS NULL
      AND (
        notification.created_at < ${createdAt}
        OR (
          notification.created_at = ${createdAt}
          AND notification.id < ${id}
        )
      )
    )`;
  }

  const eventAt = sql`${cursor.eventAt}::timestamptz`;
  return sql`(
    notification.event_at IS NULL
    OR notification.event_at < ${eventAt}
    OR (
      notification.event_at = ${eventAt}
      AND notification.created_at < ${createdAt}
    )
    OR (
      notification.event_at = ${eventAt}
      AND notification.created_at = ${createdAt}
      AND notification.id < ${id}
    )
  )`;
}

export async function listWalletNotifications(
  input: ListWalletNotificationsInput,
): Promise<ListWalletNotificationsOutput> {
  const subjectWalletAddress = resolveSubjectWalletFromContext();
  if (!subjectWalletAddress) {
    throw new WalletNotificationsSubjectRequiredError();
  }

  const cursor = resolveCursor(input);
  const unread = await getUnreadState(subjectWalletAddress, input.kinds);
  const filters = buildVisibleNotificationFilters(subjectWalletAddress);
  const kindsFilter = resolveKindsFilter(input.kinds);
  if (kindsFilter) {
    filters.push(kindsFilter);
  }
  if (input.unreadOnly) {
    filters.push(sql`(
      state.last_read_at IS NULL
      OR notification.created_at > state.last_read_at
    )`);
  }
  if (cursor) {
    filters.push(buildCursorFilter(cursor));
  }

  const fetchLimit = input.limit + 1;
  const result = (await cobuildPrimaryDb().execute(sql`
    SELECT
      notification.id,
      notification.kind,
      notification.reason,
      ${buildIsoTimestampSql("notification", "event_at")} AS "eventAtCursor",
      ${buildIsoTimestampSql("notification", "created_at")} AS "createdAtCursor",
      (
        state.last_read_at IS NULL
        OR notification.created_at > state.last_read_at
      ) AS "isUnread",
      notification.source_type AS "sourceType",
      notification.source_id AS "sourceId",
      encode(notification.source_cast_hash, 'hex') AS "sourceHashHex",
      encode(notification.root_cast_hash, 'hex') AS "rootHashHex",
      encode(notification.target_cast_hash, 'hex') AS "targetHashHex",
      notification.actor_fid AS "actorFid",
      notification.actor_wallet_address AS "actorWalletAddress",
      actor.fname AS "actorUsername",
      actor.display_name AS "actorDisplayName",
      actor.avatar_url AS "actorAvatarUrl",
      source.text AS "sourceText",
      root.text AS "rootText",
      notification.payload
    ${NOTIFICATION_FROM_SQL}
    WHERE ${joinFilters(filters)}
    ORDER BY notification.event_at DESC NULLS LAST, notification.created_at DESC, notification.id DESC
    LIMIT ${fetchLimit}
  `)) as { rows?: NotificationRow[] };

  const rows = result.rows ?? [];
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const items = pageRows.map(mapNotificationRow);
  const last = pageRows.at(-1);

  return {
    subjectWalletAddress,
    items,
    pageInfo: {
      limit: input.limit,
      nextCursor:
        hasMore && last
          ? encodeWalletNotificationsCursor({
              eventAt: last.eventAtCursor,
              createdAt: last.createdAtCursor,
              id: toNumericString(last.id),
            })
          : null,
      hasMore,
    },
    unread,
  };
}
