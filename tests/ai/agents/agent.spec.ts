import { describe, expect, it, vi } from "vitest";
import { getAgent, getAgentByFid, getRandomAgentFid } from "../../../src/ai/agents/agent";
import { CHAT_DEFAULT_FID } from "../../../src/config/constants";
import { getChatDefault } from "../../../src/ai/agents/chat-default/chat-default";

vi.mock("../../../src/ai/agents/chat-default/chat-default", () => ({
  getChatDefault: vi.fn(async () => ({ system: [], tools: {}, defaultModel: {} })),
}));

describe("agent helpers", () => {
  it("gets the chat-default agent", async () => {
    const agent = await getAgent("chat-default", null, {});
    expect(getChatDefault).toHaveBeenCalled();
    expect(agent.system).toEqual([]);
  });

  it("throws for unsupported agent types", async () => {
    const badType = "unknown" as unknown as Parameters<typeof getAgent>[0];
    await expect(getAgent(badType, null, {})).rejects.toThrow("Unsupported agent");
  });

  it("gets agent by fid", async () => {
    await expect(getAgentByFid(CHAT_DEFAULT_FID)).resolves.toBeDefined();
    await expect(getAgentByFid(123)).rejects.toThrow("Unsupported agent FID");
  });

  it("returns a random agent fid", () => {
    expect(getRandomAgentFid()).toBe(CHAT_DEFAULT_FID);
  });
});
