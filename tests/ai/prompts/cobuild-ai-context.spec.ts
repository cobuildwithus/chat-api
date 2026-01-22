import { describe, expect, it, vi } from "vitest";
import { cobuildAiContextPrompt } from "../../../src/ai/prompts/cobuild-ai-context";
import { getCobuildAiContextSnapshot } from "../../../src/infra/cobuild-ai-context";

vi.mock("../../../src/infra/cobuild-ai-context", () => ({
  getCobuildAiContextSnapshot: vi.fn(),
  COBUILD_AI_CONTEXT_URL: "https://co.build/api/cobuild/ai-context",
}));

describe("cobuildAiContextPrompt", () => {
  it("returns fallback message when snapshot fails", async () => {
    vi.mocked(getCobuildAiContextSnapshot).mockResolvedValue({ data: null, error: "down" });

    const prompt = await cobuildAiContextPrompt();
    expect(prompt).toContain("Cobuild live stats unavailable: down");
  });

  it("returns formatted snapshot when data is present", async () => {
    vi.mocked(getCobuildAiContextSnapshot).mockResolvedValue({
      data: { prompt: "hello", extra: true },
    });

    const prompt = await cobuildAiContextPrompt();
    expect(prompt).toContain("Cobuild live stats (snapshot)");
    expect(prompt).toContain("hello");
    expect(prompt).toContain("\"extra\": true");
  });

  it("falls back to unavailable prompt text when prompt is empty", async () => {
    vi.mocked(getCobuildAiContextSnapshot).mockResolvedValue({
      data: { prompt: "   " },
    });

    const prompt = await cobuildAiContextPrompt();
    expect(prompt).toContain("Unavailable.");
  });
});
