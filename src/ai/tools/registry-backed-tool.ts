import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../tools/registry";

type RegistryBackedToolOptions<TInputSchema extends z.ZodTypeAny> = {
  description: string;
  inputSchema: TInputSchema;
  registryName: string;
};

export function registryBackedTool<TInputSchema extends z.ZodTypeAny>(
  options: RegistryBackedToolOptions<TInputSchema>,
) {
  return tool({
    description: options.description,
    inputSchema: options.inputSchema,
    execute: async (input: z.infer<TInputSchema>) => {
      const result = await executeTool(options.registryName, input as Record<string, unknown>);
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  });
}
