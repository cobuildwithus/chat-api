import { tool } from "ai";
import {
  executeTool,
  resolveToolExposure,
  resolveToolInputSchema,
} from "../../tools/registry";

type RegistryBackedToolOptions = {
  description: string;
  registryName: string;
};

export function registryBackedTool(options: RegistryBackedToolOptions) {
  const exposure = resolveToolExposure(options.registryName);
  if (!exposure) {
    throw new Error(`Unknown registry-backed AI tool "${options.registryName}".`);
  }
  if (exposure !== "chat-safe") {
    throw new Error(
      `Registry-backed AI tool "${options.registryName}" must be explicitly marked chat-safe.`,
    );
  }

  const inputSchema = resolveToolInputSchema(options.registryName);
  if (!inputSchema) {
    throw new Error(`Unknown registry-backed AI tool "${options.registryName}".`);
  }

  return tool({
    description: options.description,
    inputSchema,
    execute: async (input) => {
      const result = await executeTool(options.registryName, input);
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  });
}
