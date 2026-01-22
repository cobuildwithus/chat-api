import { describe, expect, it, vi } from "vitest";

const setupAiMock = () => {
  const fileSearch = vi.fn(() => ({ type: "file_search" }));
  const webSearch = vi.fn(() => ({ type: "web_search" }));

  vi.doMock("../../../src/ai/ai", () => ({
    openAIProvider: { tools: { fileSearch, webSearch } },
    openAIModel: {} as Record<string, unknown>,
    openAIModel5Mini: {} as Record<string, unknown>,
  }));

  return { fileSearch, webSearch };
};

describe("docsFileSearchTool", () => {
  it("returns null when docs vector store id is missing", async () => {
    vi.resetModules();
    delete process.env.DOCS_VECTOR_STORE_ID;
    const { fileSearch } = setupAiMock();

    const { docsFileSearchTool } = await import("../../../src/ai/tools/docs/docs");

    expect(docsFileSearchTool).toBeNull();
    expect(fileSearch).not.toHaveBeenCalled();
  });

  it("creates file search tool when vector store id is set", async () => {
    vi.resetModules();
    process.env.DOCS_VECTOR_STORE_ID = "vector-id";
    const { fileSearch } = setupAiMock();

    const { docsFileSearchTool } = await import("../../../src/ai/tools/docs/docs");

    expect(docsFileSearchTool?.name).toBe("file_search");
    await expect(docsFileSearchTool?.prompt()).resolves.toContain("Docs File Search Tool");
    expect(fileSearch).toHaveBeenCalledWith({ vectorStoreIds: ["vector-id"], maxNumResults: 8 });
  });
});

describe("webSearchTool", () => {
  it("builds the web search tool", async () => {
    vi.resetModules();
    const { webSearch } = setupAiMock();

    const { webSearchTool } = await import("../../../src/ai/tools/web-search/web-search");

    expect(webSearchTool.name).toBe("web_search");
    await expect(webSearchTool.prompt()).resolves.toContain("Web Search Tool");
    expect(webSearch).toHaveBeenCalled();
  });
});
