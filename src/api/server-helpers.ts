type ErrorDetails = {
  message?: string;
  code?: string;
  stack?: string;
  name?: string;
  validation?: unknown;
  statusCode?: number;
};

type RequestDetails = {
  method?: string;
  url?: string;
  headers?: unknown;
  body?: unknown;
};

type ReplyDetails = {
  status: (code: number) => { send: (body: ErrorDetails & { error: string }) => unknown };
};

function toErrorDetails(error: unknown): ErrorDetails {
  if (!error || typeof error !== "object") return {};
  return error as ErrorDetails;
}

export function handleError(error: unknown, request: RequestDetails, reply: ReplyDetails) {
  const errorDetails = toErrorDetails(error);
  const statusCode =
    typeof errorDetails.statusCode === "number" ? errorDetails.statusCode : 500;
  const name = errorDetails.name ?? "Internal Server Error";
  const message = errorDetails.message ?? "An unexpected error occurred";

  console.error("Error handler triggered with:", {
    error: JSON.stringify(error, null, 2),
    errorPrototype: Object.getPrototypeOf(error),
  });

  console.error("Detailed error:", {
    message: errorDetails.message,
    code: errorDetails.code,
    stack: errorDetails.stack,
    name: errorDetails.name,
    validation: errorDetails.validation,
    statusCode: errorDetails.statusCode,
  });

  console.error("Request details:", {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  });

  reply.status(statusCode).send({
    error: name,
    message,
    statusCode,
  });
}
