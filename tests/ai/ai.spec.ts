import { beforeEach, describe, expect, it, vi } from "vitest";

const createOpenAIMock = vi.fn();

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (...args: unknown[]) => createOpenAIMock(...args),
}));

describe("ai module", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("../../src/ai/ai");
  });

  it("initializes OpenAI provider and models", async () => {
    const responsesMock = vi.fn(() => ({ id: "responses-model" }));
    const provider = {
      responses: responsesMock,
      tools: {},
    } as { responses: (model: string) => unknown; tools: Record<string, unknown> };
    createOpenAIMock.mockReturnValue(provider);

    process.env.OPENAI_API_KEY = "test-key";

    const ai = await import("../../src/ai/ai");

    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-key", fetch: expect.any(Function) }),
    );
    expect(responsesMock).toHaveBeenCalledWith("gpt-5.2-2025-12-11");
    expect(responsesMock).toHaveBeenCalledWith("gpt-5-mini-2025-08-07");
    expect(ai.openAIProvider).toBe(provider);
  });
});
