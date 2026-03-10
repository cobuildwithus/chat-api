import { z } from "zod";
import {
  authorizeToolExecution,
  normalizeToolLookupKey,
  toToolInputFailure,
  toToolInputSchema,
} from "./registry/runtime";
import {
  DEFAULT_TOOL_AUTH_POLICY,
  requiresWriteScopeForMetadata,
  type RegisteredTool,
  type ToolAuthPolicy,
  type ToolMetadata,
} from "./registry/types";
import { contextToolDefinitions } from "./registry/context";
import { farcasterToolDefinitions } from "./registry/farcaster";
import { protocolToolDefinitions } from "./registry/protocol";
import { walletToolDefinitions } from "./registry/wallet";

export {
  NO_STORE_CACHE_CONTROL,
  SHORT_PRIVATE_CACHE_CONTROL,
  SHORT_PUBLIC_CACHE_CONTROL,
} from "./registry/runtime";

export type {
  ToolAuthPolicy,
  ToolExecutionFailure,
  ToolExecutionResult,
  ToolExecutionSuccess,
  ToolMetadata,
  ToolSideEffects,
  ToolWalletBinding,
  ToolWriteCapability,
} from "./registry/types";

export { requiresWriteScopeForMetadata } from "./registry/types";

const RAW_TOOL_DEFINITIONS = [
  ...farcasterToolDefinitions,
  ...walletToolDefinitions,
  ...protocolToolDefinitions,
  ...contextToolDefinitions,
];

const TOOL_DEFINITIONS: RegisteredTool[] = RAW_TOOL_DEFINITIONS.map((tool) => ({
  ...tool,
  authPolicy: tool.authPolicy ?? DEFAULT_TOOL_AUTH_POLICY,
  inputSchema: toToolInputSchema(tool.input),
}));

const TOOL_LOOKUP = new Map<string, RegisteredTool>();
for (const tool of TOOL_DEFINITIONS) {
  for (const key of [tool.name, ...tool.aliases]) {
    const normalizedKey = normalizeToolLookupKey(key);
    /* c8 ignore next 3 -- registration collisions are prevented by static literals */
    if (TOOL_LOOKUP.has(normalizedKey)) {
      throw new Error(`Duplicate tool registration for key "${key}"`);
    }
    TOOL_LOOKUP.set(normalizedKey, tool);
  }
}

function toMetadata(tool: RegisteredTool): ToolMetadata {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    scopes: tool.scopes,
    authPolicy: tool.authPolicy,
    sideEffects: tool.sideEffects,
    version: tool.version,
    deprecated: tool.deprecated,
    aliases: tool.aliases,
  };
}

export function listToolMetadata(): ToolMetadata[] {
  return TOOL_DEFINITIONS.map(toMetadata);
}

export function resolveToolMetadata(name: string): ToolMetadata | null {
  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(name));
  if (!tool) {
    return null;
  }
  return toMetadata(tool);
}

export function resolveToolAuthPolicy(name: string): ToolAuthPolicy | null {
  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(name));
  return tool?.authPolicy ?? null;
}

export function resolveToolInputSchema(name: string): z.ZodTypeAny | null {
  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(name));
  return tool?.input ?? null;
}

export function requiresWriteScopeForTool(name: string): boolean {
  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(name));
  if (!tool) return false;
  return requiresWriteScopeForMetadata(tool);
}

export async function executeTool(name: string, input: unknown) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return {
      ok: false as const,
      name: "",
      statusCode: 400,
      error: "Tool name must not be empty.",
    };
  }

  const tool = TOOL_LOOKUP.get(normalizeToolLookupKey(normalizedName));
  if (!tool) {
    return {
      ok: false as const,
      name: normalizedName,
      statusCode: 404,
      error: `Unknown tool "${normalizedName}".`,
    };
  }

  if (tool.authPolicy.walletBinding === "subject-wallet" ||
      tool.authPolicy.requiredScopes.some((scope) => scope !== "tools:read")) {
    const accessFailure = authorizeToolExecution(tool);
    if (accessFailure) {
      return accessFailure;
    }
  }

  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return toToolInputFailure(tool.name, parsed.error);
  }

  if (!(tool.authPolicy.walletBinding === "subject-wallet" ||
      tool.authPolicy.requiredScopes.some((scope) => scope !== "tools:read"))) {
    const accessFailure = authorizeToolExecution(tool);
    if (accessFailure) {
      return accessFailure;
    }
  }

  const result = await tool.execute(parsed.data);
  return { ...result, name: tool.name };
}
