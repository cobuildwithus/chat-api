import { z } from "zod";
import {
  formatToolInputPublicError,
  toToolExecutionPublicError,
} from "../../public-errors";
import { getToolsPrincipal } from "../../api/auth/principals";
import type {
  JsonSchema,
  RegisteredTool,
  ToolAuthPolicy,
  ToolExecutionFailure,
  ToolExecutionSuccess,
} from "./types";

export const NO_STORE_CACHE_CONTROL = "no-store";
export const SHORT_PRIVATE_CACHE_CONTROL = "private, max-age=60";
export const SHORT_PUBLIC_CACHE_CONTROL = "public, max-age=60";

export function success(
  name: string,
  output: unknown,
  cacheControl?: string,
): ToolExecutionSuccess {
  return {
    ok: true,
    name,
    output,
    ...(cacheControl ? { cacheControl } : {}),
  };
}

export function failureFromPublicError(
  name: string,
  key: Parameters<typeof toToolExecutionPublicError>[1],
  context?: Parameters<typeof toToolExecutionPublicError>[2],
): ToolExecutionFailure {
  return toToolExecutionPublicError(name, key, context);
}

export function toToolInputFailure(
  name: string,
  error: z.ZodError,
): ToolExecutionFailure {
  return {
    ok: false,
    name,
    statusCode: 400,
    error: formatToolInputPublicError(name, error),
  };
}

export function toToolInputSchema(schema: z.ZodTypeAny): JsonSchema {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

export function normalizeToolLookupKey(name: string): string {
  return name.trim().toLowerCase();
}

export function requiresToolsPrincipal(policy: ToolAuthPolicy): boolean {
  return (
    policy.walletBinding === "subject-wallet" ||
    policy.requiredScopes.some((scope) => scope !== "tools:read")
  );
}

export function authorizeToolExecution(tool: RegisteredTool): ToolExecutionFailure | null {
  const toolsPrincipal = getToolsPrincipal();
  if (requiresToolsPrincipal(tool.authPolicy) && !toolsPrincipal) {
    return failureFromPublicError(tool.name, "toolPrincipalRequired");
  }

  if (toolsPrincipal) {
    for (const requiredScope of tool.authPolicy.requiredScopes) {
      if (!toolsPrincipal.scopes.includes(requiredScope)) {
        return failureFromPublicError(tool.name, "toolScopeRequired", {
          scope: requiredScope,
        });
      }
    }
  }

  return null;
}
