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
    expect(module.defaultTools.some((tool) => tool.name === "list-wallet-notifications")).toBe(false);
    expect(fileSearch).toHaveBeenCalledWith({ vectorStoreIds: ["vector-store"], maxNumResults: 8 });
    expect(module.toolsByName.getUser).toBeDefined();
    expect(module.toolsByName.getGoal).toBeDefined();
    expect(module.toolsByName.getBudget).toBeDefined();
    expect(module.toolsByName.getTcrRequest).toBeDefined();
    expect(module.toolsByName.getDispute).toBeDefined();
    expect(module.toolsByName.getStakePosition).toBeDefined();
    expect(module.toolsByName.getPremiumEscrow).toBeDefined();
    expect(module.toolsByName.listDiscussions).toBeDefined();
    expect(module.toolsByName.getDiscussionThread).toBeDefined();
    expect(module.toolsByName.semanticSearchCasts).toBeDefined();
  });

  it("omits docs tool when vector store id is missing", async () => {
    const { module } = await setup(undefined);
    expect(module.defaultTools.some((tool) => tool.name === "file_search")).toBe(false);
    expect(module.defaultTools.some((tool) => tool.name === "list-wallet-notifications")).toBe(false);
    expect(module.defaultTools.some((tool) => tool.name === "getGoal")).toBe(true);
    expect(module.defaultTools.some((tool) => tool.name === "getBudget")).toBe(true);
    expect(module.defaultTools.some((tool) => tool.name === "getTcrRequest")).toBe(true);
    expect(module.defaultTools.some((tool) => tool.name === "getDispute")).toBe(true);
    expect(module.defaultTools.some((tool) => tool.name === "getStakePosition")).toBe(true);
    expect(module.defaultTools.some((tool) => tool.name === "getPremiumEscrow")).toBe(true);
  });
});
