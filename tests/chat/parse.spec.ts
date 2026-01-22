import { describe, expect, it } from "vitest";
import { parseJson } from "../../src/chat/parse";

describe("parseJson", () => {
  it("parses JSON strings", () => {
    expect(parseJson("{\"a\":1}")).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON", () => {
    expect(parseJson("{bad json")).toBeNull();
  });

  it("returns non-string values as-is", () => {
    const obj = { a: 1 };
    expect(parseJson(obj)).toBe(obj);
  });
});
