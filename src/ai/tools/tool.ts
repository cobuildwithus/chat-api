import type { Tool as AITool, SystemModelMessage, ToolSet } from "ai";

export type Tool = {
  name: string;
  prompt: () => Promise<string>;
  tool: AITool;
};

export function getTools(tools: Tool[]): ToolSet {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool.tool])) as ToolSet;
}

export async function getToolPrompts(tools: Tool[]): Promise<SystemModelMessage[]> {
  return await Promise.all(
    tools.map(
      async (tool): Promise<SystemModelMessage> => ({
        role: "system",
        content: await tool.prompt(),
      }),
    ),
  );
}

export function cachedPrompts(prompts: SystemModelMessage[]): SystemModelMessage[] {
  if (prompts.length === 0) return prompts;

  const lastIndex = prompts.length - 1;
  // v5: provider metadata moved to providerOptions on the request; keep prompts as pure system messages
  prompts[lastIndex] = { ...prompts[lastIndex] };

  return prompts;
}
