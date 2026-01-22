import { describe, expect, it } from "vitest";
import { isSameAddress, normalizeAddress } from "../../src/chat/address";

describe("chat address helpers", () => {
  it("normalizes addresses to lowercase", () => {
    expect(normalizeAddress("0xAbC0000000000000000000000000000000000000")).toBe(
      "0xabc0000000000000000000000000000000000000",
    );
  });

  it("returns null for non-string or empty values", () => {
    expect(normalizeAddress(null)).toBeNull();
    expect(normalizeAddress(undefined)).toBeNull();
    expect(normalizeAddress(123)).toBeNull();
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress("0xabc")).toBeNull();
  });

  it("compares addresses case-insensitively", () => {
    expect(
      isSameAddress(
        "0xABC0000000000000000000000000000000000000",
        "0xabc0000000000000000000000000000000000000",
      ),
    ).toBe(true);
    expect(
      isSameAddress(
        "0xabc0000000000000000000000000000000000000",
        "0xdef0000000000000000000000000000000000000",
      ),
    ).toBe(false);
    expect(isSameAddress("0xabc", null)).toBe(false);
  });
});
