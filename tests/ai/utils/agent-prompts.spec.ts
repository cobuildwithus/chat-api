import { describe, expect, it, vi } from "vitest";
import type { Tool as AITool } from "ai";
import { getAgentPrompts } from "../../../src/ai/utils/agent-prompts";
import { getGoalPrompt } from "../../../src/ai/prompts/goal";
import type { Tool as CobuildTool } from "../../../src/ai/tools/tool";

vi.mock("../../../src/ai/prompts/about", () => ({
  aboutPrompt: vi.fn(async () => "about"),
}));
vi.mock("../../../src/ai/prompts/manifesto", () => ({
  manifestoPrompt: vi.fn(async () => "manifesto"),
}));
vi.mock("../../../src/ai/prompts/bill-of-rights", () => ({
  billOfRightsPrompt: vi.fn(async () => "rights"),
}));
vi.mock("../../../src/ai/prompts/goal", () => ({
  getGoalPrompt: vi.fn(async () => ""),
}));
vi.mock("../../../src/ai/prompts/cobuild-ai-context", () => ({
  cobuildAiContextPrompt: vi.fn(async () => "context"),
}));
vi.mock("../../../src/ai/prompts/user-data", () => ({
  getUserDataPrompt: vi.fn(async () => "user"),
}));

describe("getAgentPrompts", () => {
  it("builds prompts with tools and extra prompts", async () => {
    const tool: CobuildTool = {
      name: "tool-1",
      prompt: async () => "tool prompt",
      tool: {} as AITool,
    };
    const prompts = await getAgentPrompts({
      personality: "persona",
      user: null,
      data: { goalAddress: "0xabc", grantId: "skip" },
      tools: [tool],
      extraPrompts: ["extra"],
    });

    const combined = prompts.map((p) => p.content).join("\n");
    expect(combined).toContain("about");
    expect(combined).toContain("manifesto");
    expect(combined).toContain("rights");
    expect(combined).toContain("persona");
    expect(combined).toContain("tool prompt");
    expect(combined).toContain("context");
    expect(combined).toContain("# Additional data");
    expect(combined).toContain("extra");
  });

  it("adds user data prompt when user is present", async () => {
    vi.mocked(getGoalPrompt).mockResolvedValueOnce("goal");
    const prompts = await getAgentPrompts({
      personality: "persona",
      user: { address: "0xabc", city: null, country: null, countryRegion: null, userAgent: null },
      data: {},
      tools: [],
      extraPrompts: [],
    });

    const contents = prompts.map((p) => p.content);
    expect(contents).toContain("user");
    expect(contents).toContain("goal");
  });
});
