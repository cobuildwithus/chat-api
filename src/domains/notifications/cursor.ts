import type { WalletNotificationsCursor } from "./types";

function isValidCursorDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function encodeWalletNotificationsCursor(cursor: WalletNotificationsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeWalletNotificationsCursor(value: string): WalletNotificationsCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed.eventAt !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }
    if (!isValidCursorDate(parsed.eventAt) || !isValidCursorDate(parsed.createdAt)) {
      return null;
    }
    if (!/^[0-9]+$/.test(parsed.id)) {
      return null;
    }
    return {
      eventAt: new Date(parsed.eventAt).toISOString(),
      createdAt: new Date(parsed.createdAt).toISOString(),
      id: parsed.id,
    };
  } catch {
    return null;
  }
}
