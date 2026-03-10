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
