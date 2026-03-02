import { describe, expect, it } from "vitest";
import {
  executeTool,
  listToolMetadata,
  requiresWriteScopeForTool,
  resolveToolMetadata,
} from "../../../src/tools/registry";

describe("tool registry", () => {
  it("lists canonical metadata with required fields", () => {
    const tools = listToolMetadata();
    expect(tools.length).toBeGreaterThanOrEqual(4);

    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(Array.isArray(tool.scopes)).toBe(true);
      expect(tool.version).toBeTruthy();
      expect(typeof tool.deprecated).toBe("boolean");
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.sideEffects).toBeTruthy();
    }
  });

  it("resolves metadata for aliases", () => {
    expect(resolveToolMetadata("getUser")?.name).toBe("get-user");
    expect(resolveToolMetadata("GETUSER")?.name).toBe("get-user");
    expect(resolveToolMetadata("docs.search")?.name).toBe("docs-search");
    expect(resolveToolMetadata("listDiscussions")?.name).toBe("list-discussions");
    expect(resolveToolMetadata("getDiscussionThread")?.name).toBe("get-discussion-thread");
    expect(resolveToolMetadata("semanticSearchCasts")?.name).toBe("semantic-search-casts");
  });

  it("does not resolve removed treasury compatibility aliases", () => {
    expect(resolveToolMetadata("gettreasurystats")).toBeNull();
    expect(resolveToolMetadata("getTreasuryStats")).toBeNull();
    expect(resolveToolMetadata("buildbot.get-treasury-stats")).toBeNull();
  });

  it("returns a 404 for unknown tools", async () => {
    const result = await executeTool("nope", {});
    expect(result).toEqual({
      ok: false,
      name: "nope",
      statusCode: 404,
      error: 'Unknown tool "nope".',
    });
  });

  it("falls back to zod issue messages for unmapped validation cases", async () => {
    const result = await executeTool("get-user", { fname: "a".repeat(65) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(400);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("validates list-discussions bounds before DB execution", async () => {
    const result = await executeTool("list-discussions", { limit: 0 });
    expect(result).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 400,
      error: "limit must be between 1 and 50.",
    });
  });

  it("validates get-discussion-thread root hash format", async () => {
    const result = await executeTool("get-discussion-thread", { rootHash: "bad" });
    expect(result).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "rootHash must be a full cast hash (0x + 40 hex chars).",
    });
  });

  it("returns false for read-only and unknown tools", () => {
    expect(requiresWriteScopeForTool("get-user")).toBe(false);
    expect(requiresWriteScopeForTool("docs-search")).toBe(false);
    expect(requiresWriteScopeForTool("missing-tool")).toBe(false);
  });
});
