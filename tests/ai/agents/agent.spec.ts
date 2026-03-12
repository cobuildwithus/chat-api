import { describe, expect, it, vi } from "vitest";
import { getAgent } from "../../../src/ai/agents/agent";
import { getChatDefault } from "../../../src/ai/agents/chat-default/chat-default";

vi.mock("../../../src/ai/agents/chat-default/chat-default", () => ({
  getChatDefault: vi.fn(async () => ({ system: [], tools: {}, defaultModel: {} })),
}));

describe("agent helpers", () => {
  it("gets the chat-default agent", async () => {
    const agent = await getAgent(null, {});
    expect(getChatDefault).toHaveBeenCalledWith(null, {}, undefined);
    expect(agent.system).toEqual([]);
  });
});
