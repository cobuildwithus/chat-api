import { describe, expect, it } from "vitest";
import {
  decodeWalletNotificationsCursor,
  encodeWalletNotificationsCursor,
} from "../../../src/domains/notifications/cursor";

describe("wallet notifications cursor", () => {
  it("round-trips a valid cursor", () => {
    const encoded = encodeWalletNotificationsCursor({
      eventAt: "2026-03-08T12:00:00.123456Z",
      createdAt: "2026-03-08T12:00:03.654321Z",
      id: "42",
    });

    expect(decodeWalletNotificationsCursor(encoded)).toEqual({
      eventAt: "2026-03-08T12:00:00.123456Z",
      createdAt: "2026-03-08T12:00:03.654321Z",
      id: "42",
    });
  });

  it("round-trips a cursor whose event_at sort key is null", () => {
    const encoded = encodeWalletNotificationsCursor({
      eventAt: null,
      createdAt: "2026-03-08T12:00:03.654321Z",
      id: "42",
    });

    expect(decodeWalletNotificationsCursor(encoded)).toEqual({
      eventAt: null,
      createdAt: "2026-03-08T12:00:03.654321Z",
      id: "42",
    });
  });

  it.each([
    "not-base64url",
    Buffer.from("not-json", "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ createdAt: "2026-03-08T12:00:03.654321Z", id: "42" }), "utf8").toString("base64url"),
    Buffer.from(
      JSON.stringify({ eventAt: "invalid", createdAt: "2026-03-08T12:00:03.654321Z", id: "42" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ eventAt: "2026-03-08T12:00:00.123456Z", createdAt: "invalid", id: "42" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ eventAt: "2026-03-08T12:00:00.123456Z", createdAt: "2026-03-08T12:00:03.654321Z", id: "abc" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ eventAt: "2026-03-08T12:00:00Z", createdAt: "2026-03-08T12:00:03.654321Z", id: "42" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ eventAt: "2026-03-08T12:00:00.1234567Z", createdAt: "2026-03-08T12:00:03.654321Z", id: "42" }),
      "utf8",
    ).toString("base64url"),
  ])("rejects invalid cursor input: %s", (value) => {
    expect(decodeWalletNotificationsCursor(value)).toBeNull();
  });
});
