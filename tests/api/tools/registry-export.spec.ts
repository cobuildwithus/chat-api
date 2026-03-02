import { describe, expect, it } from "vitest";
import { resolveToolMetadata } from "../../../src/api/tools/registry";

describe("api tools registry export", () => {
  it("re-exports tool metadata helpers", () => {
    expect(resolveToolMetadata("get-user")?.name).toBe("get-user");
  });
});
