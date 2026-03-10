import { summarizeRequestBody } from "./request-body-summary";

type ErrorDetails = {
  message?: string;
  code?: string;
  stack?: string;
  name?: string;
  validation?: unknown;
  statusCode?: number;
};

type RequestDetails = {
  id?: string;
  method?: string;
  url?: string;
  headers?: unknown;
  body?: unknown;
};

type ReplyDetails = {
  status: (code: number) => { send: (body: ErrorResponse) => unknown };
};

type ErrorResponse = {
  error: string;
  message: string;
  statusCode: number;
  requestId?: string;
};

const REDACTED_VALUE = "[redacted]";
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "privy-id-token",
  "x-chat-auth",
  "x-chat-internal-key",
]);

function sanitizeHeaders(headers: unknown): unknown {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return headers;
  const record = headers as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = REDACTED_VALUE;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function toErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error as ErrorDetails),
    };
  }
  if (!error || typeof error !== "object") return {};
  return error as ErrorDetails;
}

function getSafeErrorForLogs(error: unknown): { type: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    type: typeof error,
    message: String(error),
  };
}

export function handleError(error: unknown, request: RequestDetails, reply: ReplyDetails) {
  const errorDetails = toErrorDetails(error);
  const statusCode =
    typeof errorDetails.statusCode === "number" ? errorDetails.statusCode : 500;
  const requestId = typeof request.id === "string" ? request.id : undefined;
  const isServerError = statusCode >= 500;
  const defaultName = "Internal Server Error";
  const defaultMessage = "An unexpected error occurred";
  const publicErrorName =
    isServerError ? defaultName : (errorDetails.name ?? defaultName);
  const publicMessage =
    isServerError ? defaultName : (errorDetails.message ?? defaultMessage);

  console.error("Error handler triggered:", {
    requestId,
    method: request.method,
    url: request.url,
    statusCode,
    error: getSafeErrorForLogs(error),
    code: errorDetails.code,
    validation: errorDetails.validation,
  });

  console.error("Request details:", {
    requestId,
    method: request.method,
    url: request.url,
    headers: sanitizeHeaders(request.headers),
    bodySummary: summarizeRequestBody(request.body, {
      includeQueryLength: true,
      includeLimit: true,
    }),
  });

  const response: ErrorResponse = {
    error: publicErrorName,
    message: publicMessage,
    statusCode,
  };
  if (requestId) {
    response.requestId = requestId;
  }

  reply.status(statusCode).send(response);
}
