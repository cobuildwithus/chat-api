import { describe, expect, it } from "vitest";
import { executeTool, listToolMetadata, resolveToolMetadata } from "../../../src/api/tools/registry";

describe("tool registry", () => {
  it("lists canonical metadata with required fields", () => {
    const tools = listToolMetadata();
    expect(tools.length).toBeGreaterThanOrEqual(5);

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
    expect(resolveToolMetadata("docs.search")?.name).toBe("docs-search");
  });

  it("executes aliases through the canonical tool", async () => {
    const result = await executeTool("castPreview", { text: "hello" });
    expect(result).toEqual({
      ok: true,
      name: "cast-preview",
      output: { text: "hello" },
      cacheControl: "no-store",
    });
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
});
