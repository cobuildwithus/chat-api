import { describe, expect, it, vi } from "vitest";
import { getChatDefault } from "../../../src/ai/agents/chat-default/chat-default";
import { getAgentPrompts } from "../../../src/ai/utils/agent-prompts";
import { webSearchTool } from "../../../src/ai/tools/web-search/web-search";

vi.mock("../../../src/ai/utils/agent-prompts", () => ({
  getAgentPrompts: vi.fn(async () => []),
}));

vi.mock("../../../src/ai/ai", () => ({
  openAIModel: { id: "responses" },
}));

vi.mock("../../../src/ai/tools/web-search/web-search", () => ({
  webSearchTool: { name: "web_search" },
}));

vi.mock("../../../src/ai/tools/docs/docs", () => ({
  docsFileSearchTool: null,
}));

describe("getChatDefault", () => {
  it("uses the responses model for the default chat agent", async () => {
    const agent = await getChatDefault(null, {}, [webSearchTool as any]);
    expect(getAgentPrompts).toHaveBeenCalled();
    expect(agent.defaultModel).toEqual({ id: "responses" });
  });

  it("uses the responses model even when no tools are provided", async () => {
    const agent = await getChatDefault(null, {}, []);
    expect(agent.defaultModel).toEqual({ id: "responses" });
  });
});
