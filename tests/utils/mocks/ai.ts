import { vi } from "vitest";

const openAIProvider = {
  tools: {
    fileSearch: vi.fn(() => ({ type: "file_search" })),
    webSearch: vi.fn(() => ({ type: "web_search" })),
  },
};

const tool = vi.fn((config: any) => config);

// Mock external AI SDK helpers used by generation code
vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  tool,
}));

// Mock internal model selectors used by generation code
vi.mock("../../../src/ai/ai", () => ({
  openAIProvider,
  openAIModel: {} as any,
  openAIModel5Mini: {} as any,
}));

export { openAIProvider, tool };
