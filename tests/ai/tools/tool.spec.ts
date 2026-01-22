import { describe, expect, it } from "vitest";
import type { Tool as AITool } from "ai";
import { cachedPrompts, getToolPrompts, getTools } from "../../../src/ai/tools/tool";
import type { Tool } from "../../../src/ai/tools/tool";

const tools: Tool[] = [
  { name: "a", prompt: async () => "prompt-a", tool: { name: "a" } as unknown as AITool },
  { name: "b", prompt: async () => "prompt-b", tool: { name: "b" } as unknown as AITool },
];

describe("tool helpers", () => {
  it("maps tools to a toolset", () => {
    const toolset = getTools(tools);
    expect(toolset.a).toEqual({ name: "a" });
    expect(toolset.b).toEqual({ name: "b" });
  });

  it("builds tool prompts", async () => {
    const prompts = await getToolPrompts(tools);
    expect(prompts).toEqual([
      { role: "system", content: "prompt-a" },
      { role: "system", content: "prompt-b" },
    ]);
  });

  it("clones the last prompt for cached prompts", () => {
    const prompts = [
      { role: "system" as const, content: "first" },
      { role: "system" as const, content: "second" },
    ];
    const lastPrompt = prompts[1];
    const result = cachedPrompts(prompts);
    expect(result).toBe(prompts);
    expect(result[1]).not.toBe(lastPrompt);

    const empty = cachedPrompts([]);
    expect(empty).toEqual([]);
  });
});
