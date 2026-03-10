export type WalletNotificationsCursor = {
  eventAt: string | null;
  createdAt: string;
  id: string;
};

const CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/;
const NUMERIC_STRING_PATTERN = /^[0-9]+$/;

function isValidCursorTimestamp(value: string): boolean {
  return CURSOR_TIMESTAMP_PATTERN.test(value);
}

export function encodeWalletNotificationsCursor(cursor: WalletNotificationsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeWalletNotificationsCursor(value: string): WalletNotificationsCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      (parsed.eventAt !== null && typeof parsed.eventAt !== "string") ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }
    if (
      (parsed.eventAt !== null && !isValidCursorTimestamp(parsed.eventAt)) ||
      !isValidCursorTimestamp(parsed.createdAt)
    ) {
      return null;
    }
    if (!NUMERIC_STRING_PATTERN.test(parsed.id)) {
      return null;
    }
    return {
      eventAt: parsed.eventAt,
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}
