import { describe, expect, it, vi } from "vitest";

const setup = async (vectorStoreId?: string) => {
  vi.resetModules();
  if (vectorStoreId) {
    process.env.DOCS_VECTOR_STORE_ID = vectorStoreId;
  } else {
    delete process.env.DOCS_VECTOR_STORE_ID;
  }

  const fileSearch = vi.fn(() => ({ type: "file_search" }));
  const webSearch = vi.fn(() => ({ type: "web_search" }));

  vi.doMock("../../../src/ai/ai", () => ({
    openAIProvider: { tools: { fileSearch, webSearch } },
    openAIModel: {} as Record<string, unknown>,
    openAIModel5Mini: {} as Record<string, unknown>,
  }));

  const module = await import("../../../src/ai/tools/index");
  return { module, fileSearch, webSearch };
};

describe("tools index", () => {
  it("includes docs tool when vector store id is present", async () => {
    const { module, fileSearch } = await setup("vector-store");
    expect(module.defaultTools.some((tool) => tool.name === "file_search")).toBe(true);
    expect(fileSearch).toHaveBeenCalledWith({ vectorStoreIds: ["vector-store"], maxNumResults: 8 });
    expect(module.toolsByName.getUser).toBeDefined();
  });

  it("omits docs tool when vector store id is missing", async () => {
    const { module } = await setup(undefined);
    expect(module.defaultTools.some((tool) => tool.name === "file_search")).toBe(false);
  });
});
