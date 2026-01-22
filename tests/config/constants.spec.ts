import { describe, expect, it } from "vitest";
import { CHAT_DEFAULT_FID } from "../../src/config/constants";

describe("constants", () => {
  it("exports the default chat fid", () => {
    expect(CHAT_DEFAULT_FID).toBeGreaterThan(0);
  });
});
