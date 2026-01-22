import { vi } from "vitest";

const openAIProvider = {
  tools: {
    fileSearch: vi.fn(() => ({ type: "file_search" })),
    webSearch: vi.fn(() => ({ type: "web_search" })),
  },
};

const tool = vi.fn((config: unknown) => config);

// Mock external AI SDK helpers used by generation code
vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  tool,
}));

// Mock internal model selectors used by generation code
vi.mock("../../../src/ai/ai", () => ({
  openAIProvider,
  openAIModel: {} as Record<string, unknown>,
  openAIModel5Mini: {} as Record<string, unknown>,
}));

export { openAIProvider, tool };
