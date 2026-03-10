import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

export type ToolSideEffects = "none" | "read" | "network-read" | "network-write";
export type ToolWriteCapability = "none" | "requires-tools-write";
export type ToolWalletBinding = "none" | "subject-wallet";
export type ToolExposure = "chat-safe" | "bearer-only";

export type ToolAuthPolicy = {
  requiredScopes: string[];
  walletBinding: ToolWalletBinding;
};

export type ToolMetadata = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  scopes: string[];
  authPolicy: ToolAuthPolicy;
  exposure: ToolExposure;
  sideEffects: ToolSideEffects;
  version: string;
  deprecated: boolean;
  aliases?: string[];
};

export type ToolCapabilityMetadata = {
  writeCapability: ToolWriteCapability;
};

export type ToolExecutionSuccess = {
  ok: true;
  name: string;
  output: unknown;
  cacheControl?: string;
};

export type ToolExecutionFailure = {
  ok: false;
  name: string;
  statusCode: number;
  error: string;
};

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;
export type ToolExecute = (input: any) => Promise<ToolExecutionResult>;

export type RegisteredTool = ToolMetadata & ToolCapabilityMetadata & {
  input: z.ZodTypeAny;
  aliases: string[];
  execute: ToolExecute;
};

export type RawRegisteredTool = Omit<RegisteredTool, "inputSchema" | "authPolicy" | "exposure"> & {
  authPolicy?: ToolAuthPolicy;
  exposure?: ToolExposure;
};

export const DEFAULT_TOOL_AUTH_POLICY: ToolAuthPolicy = {
  requiredScopes: ["tools:read"],
  walletBinding: "none",
};

export const DEFAULT_TOOL_EXPOSURE: ToolExposure = "bearer-only";

export const SUBJECT_WALLET_READ_TOOL_AUTH_POLICY: ToolAuthPolicy = {
  requiredScopes: ["tools:read"],
  walletBinding: "subject-wallet",
};

export const SUBJECT_WALLET_NOTIFICATIONS_READ_TOOL_AUTH_POLICY: ToolAuthPolicy = {
  requiredScopes: ["tools:read", "notifications:read"],
  walletBinding: "subject-wallet",
};

export function requiresWriteScopeForMetadata(
  tool: Pick<ToolCapabilityMetadata, "writeCapability"> & Pick<ToolMetadata, "sideEffects">,
): boolean {
  return tool.writeCapability === "requires-tools-write" || tool.sideEffects === "network-write";
}
