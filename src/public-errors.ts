import { z } from "zod";

const TOOL_INPUT_LIMITS = {
  docsSearchQueryMax: 1000,
  docsSearchLimitMin: 1,
  docsSearchLimitMax: 20,
  discussionLimitMin: 1,
  discussionLimitMax: 50,
  discussionThreadPageMax: 10000,
  semanticSearchLimitMin: 1,
  semanticSearchLimitMax: 25,
} as const;

export type PublicErrorKey =
  | "chatAuthMisconfigured"
  | "chatAuthRequired"
  | "chatAuthInvalid"
  | "chatTokenRequired"
  | "chatUserRequired"
  | "chatUserInvalid"
  | "chatNotFound"
  | "chatTypeMismatch"
  | "chatCreateFailed"
  | "chatRateLimited"
  | "contextUnavailable"
  | "toolsUnauthorized"
  | "toolsReadScopeRequired"
  | "toolPrincipalRequired"
  | "toolAgentKeyMismatch"
  | "toolScopeRequired"
  | "toolNameRequired"
  | "toolUnknown"
  | "toolEntityNotFound"
  | "toolIdentifierAmbiguous"
  | "toolDisabled"
  | "toolUnavailable"
  | "toolExecutionFailed"
  | "toolInternalError"
  | "toolWalletSubjectRequired"
  | "toolNotificationsCursorInvalid"
  | "toolCastUrlUnsupported"
  | "toolCastHashRequired";

export type PublicErrorDefinition = {
  statusCode: number;
  error: string;
};

type PublicErrorContext = {
  entityName?: string;
  scope?: string;
  toolName?: string;
};

const STATIC_PUBLIC_ERRORS = {
  chatAuthMisconfigured: {
    statusCode: 503,
    error: "Self-hosted auth is misconfigured.",
  },
  chatAuthRequired: {
    statusCode: 401,
    error: "Missing chat auth",
  },
  chatAuthInvalid: {
    statusCode: 401,
    error: "Invalid chat auth",
  },
  chatTokenRequired: {
    statusCode: 401,
    error: "Missing privy id token",
  },
  chatUserRequired: {
    statusCode: 401,
    error: "Missing chat user",
  },
  chatUserInvalid: {
    statusCode: 401,
    error: "Invalid chat user",
  },
  chatNotFound: {
    statusCode: 404,
    error: "Chat not found",
  },
  chatTypeMismatch: {
    statusCode: 400,
    error: "Chat type mismatch",
  },
  chatCreateFailed: {
    statusCode: 500,
    error: "Failed to create chat",
  },
  chatRateLimited: {
    statusCode: 429,
    error: "Too many AI requests. Please try again in a few hours.",
  },
  contextUnavailable: {
    statusCode: 502,
    error: "Cobuild AI context unavailable.",
  },
  toolsUnauthorized: {
    statusCode: 401,
    error: "Unauthorized.",
  },
  toolsReadScopeRequired: {
    statusCode: 403,
    error: "tools:read scope required.",
  },
  toolPrincipalRequired: {
    statusCode: 401,
    error: "Authenticated tools principal is required for this tool.",
  },
  toolAgentKeyMismatch: {
    statusCode: 403,
    error: "agentKey mismatch for this token.",
  },
  toolNameRequired: {
    statusCode: 400,
    error: "Tool name must not be empty.",
  },
  toolDisabled: {
    statusCode: 403,
    error: "This tool is disabled.",
  },
  toolUnavailable: {
    statusCode: 503,
    error: "Tool is unavailable.",
  },
  toolExecutionFailed: {
    statusCode: 502,
    error: "Tool request failed.",
  },
  toolInternalError: {
    statusCode: 500,
    error: "Tool request failed.",
  },
  toolWalletSubjectRequired: {
    statusCode: 401,
    error: "Authenticated subject wallet is required to list wallet notifications.",
  },
  toolNotificationsCursorInvalid: {
    statusCode: 400,
    error: "cursor must be a valid notifications cursor.",
  },
  toolCastUrlUnsupported: {
    statusCode: 400,
    error: "URL lookup is no longer supported. Provide a full cast hash (0x + 40 hex chars).",
  },
  toolCastHashRequired: {
    statusCode: 400,
    error: "identifier must be a full cast hash (0x + 40 hex chars).",
  },
} satisfies Record<
  Exclude<
    PublicErrorKey,
    "toolScopeRequired" | "toolUnknown" | "toolEntityNotFound" | "toolIdentifierAmbiguous"
  >,
  PublicErrorDefinition
>;

export function getPublicError(
  key: PublicErrorKey,
  context: PublicErrorContext = {},
): PublicErrorDefinition {
  if (key === "toolScopeRequired") {
    return {
      statusCode: 403,
      error: `This token does not have ${context.scope ?? "required"} scope for the requested tool.`,
    };
  }

  if (key === "toolUnknown") {
    return {
      statusCode: 404,
      error: `Unknown tool "${context.toolName ?? ""}".`,
    };
  }

  if (key === "toolEntityNotFound") {
    return {
      statusCode: 404,
      error: `${context.entityName ?? "Resource"} not found.`,
    };
  }

  if (key === "toolIdentifierAmbiguous") {
    return {
      statusCode: 409,
      error: `${context.entityName ?? "Resource"} identifier is ambiguous. Use a canonical address instead.`,
    };
  }

  return STATIC_PUBLIC_ERRORS[key];
}

export function toPublicErrorBody(
  key: PublicErrorKey,
  context?: PublicErrorContext,
): { error: string } {
  return { error: getPublicError(key, context).error };
}

export function toToolExecutionPublicError(
  name: string,
  key: PublicErrorKey,
  context?: Omit<PublicErrorContext, "toolName">,
) {
  const error = getPublicError(key, { ...context, toolName: name });
  return {
    ok: false as const,
    name,
    statusCode: error.statusCode,
    error: error.error,
  };
}

export function formatToolInputPublicError(toolName: string, error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid tool input.";
  const path = issue.path.map(String);
  const field = path[0];

  if (toolName === "get-user") {
    if (field === "fname" && issue.code === "invalid_type") return "fname must be a string.";
    if (field === "fname" && issue.code === "too_small") return "fname must not be empty.";
  }

  if (toolName === "get-cast") {
    if (field === "identifier" && issue.code === "invalid_type") return "identifier must be a string.";
    if (field === "identifier" && issue.code === "too_small") return "identifier must not be empty.";
    if (field === "type") return 'type must be either "hash" or "url".';
  }

  if (toolName === "cast-preview") {
    if (field === "text" && issue.code === "invalid_type") return "text must be a string.";
    if (field === "text" && issue.code === "too_small") return "text must not be empty.";
    if (field === "embeds" && issue.code === "invalid_type") return "embeds must be an array.";
    if (field === "embeds" && issue.code === "too_big") return "embeds may include at most 2 URLs.";
  }

  if (toolName === "get-wallet-balances") {
    if (field === "agentKey" && issue.code === "invalid_type") return "agentKey must be a string.";
    if (field === "agentKey" && issue.code === "too_small") return "agentKey must not be empty.";
    if (field === "network") return 'network must be "base".';
  }

  if (
    toolName === "get-goal" ||
    toolName === "get-budget" ||
    toolName === "get-tcr-request" ||
    toolName === "get-dispute" ||
    toolName === "get-stake-position" ||
    toolName === "get-premium-escrow"
  ) {
    if (field === "identifier" && issue.code === "invalid_type") return "identifier must be a string.";
    if (field === "identifier" && issue.code === "too_small") return "identifier must not be empty.";
  }

  if (toolName === "get-dispute") {
    if (field === "juror" && issue.code === "invalid_type") return "juror must be a string.";
    if (field === "juror") return "juror must be a valid EVM address.";
  }

  if (toolName === "get-stake-position" || toolName === "get-premium-escrow") {
    if (field === "account" && issue.code === "invalid_type") return "account must be a string.";
    if (field === "account") return "account must be a valid EVM address.";
  }

  if (toolName === "list-wallet-notifications") {
    if (field === "limit" && issue.code === "invalid_type") return "limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return "limit must be between 1 and 50.";
    }
    if (field === "cursor" && issue.code === "invalid_type") return "cursor must be a string.";
    if (field === "cursor" && issue.code === "too_small") return "cursor must not be empty.";
    if (field === "unreadOnly" && issue.code === "invalid_type") return "unreadOnly must be a boolean.";
    if (field === "kinds" && issue.code === "invalid_type") return "kinds must be an array.";
    if (field === "kinds") return 'kinds may only include "discussion", "payment", or "protocol".';
  }

  if (toolName === "docs-search") {
    if (field === "query" && issue.code === "invalid_type") return "Query must be a string.";
    if (field === "query" && issue.code === "too_small") return "Query must not be empty.";
    if (field === "query" && issue.code === "too_big") {
      return `Query must be at most ${TOOL_INPUT_LIMITS.docsSearchQueryMax} characters.`;
    }
    if (field === "limit" && issue.code === "invalid_type") return "Limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `Limit must be between ${TOOL_INPUT_LIMITS.docsSearchLimitMin} and ${TOOL_INPUT_LIMITS.docsSearchLimitMax}.`;
    }
  }

  if (toolName === "list-discussions") {
    if (field === "limit" && issue.code === "invalid_type") return "limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `limit must be between ${TOOL_INPUT_LIMITS.discussionLimitMin} and ${TOOL_INPUT_LIMITS.discussionLimitMax}.`;
    }
    if (field === "offset" && issue.code === "invalid_type") return "offset must be an integer.";
    if (field === "offset" && (issue.code === "too_small" || issue.code === "too_big")) {
      return "offset must be between 0 and 10000.";
    }
  }

  if (toolName === "get-discussion-thread") {
    if (field === "rootHash") return "rootHash must be a full cast hash (0x + 40 hex chars).";
    if (field === "focusHash") return "focusHash must be a full cast hash (0x + 40 hex chars).";
    if (field === "page" && issue.code === "invalid_type") return "page must be an integer.";
    if (field === "page" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `page must be between 1 and ${TOOL_INPUT_LIMITS.discussionThreadPageMax}.`;
    }
    if (field === "pageSize" && issue.code === "invalid_type") return "pageSize must be an integer.";
    if (field === "pageSize" && (issue.code === "too_small" || issue.code === "too_big")) {
      return "pageSize must be between 1 and 100.";
    }
  }

  if (toolName === "semantic-search-casts") {
    if (field === "query" && issue.code === "invalid_type") return "query must be a string.";
    if (field === "query" && issue.code === "too_small") return "query must not be empty.";
    if (field === "limit" && issue.code === "invalid_type") return "limit must be an integer.";
    if (field === "limit" && (issue.code === "too_small" || issue.code === "too_big")) {
      return `limit must be between ${TOOL_INPUT_LIMITS.semanticSearchLimitMin} and ${TOOL_INPUT_LIMITS.semanticSearchLimitMax}.`;
    }
    if (field === "rootHash" && issue.code === "invalid_type") return "rootHash must be a string.";
    if (field === "rootHash") return "rootHash must be a full cast hash (0x + 40 hex chars).";
  }

  return issue.message || "Invalid tool input.";
}
