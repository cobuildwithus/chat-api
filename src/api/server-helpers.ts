export function handleError(error: any, request: any, reply: any) {
  console.error("Error handler triggered with:", {
    error: JSON.stringify(error, null, 2),
    errorPrototype: Object.getPrototypeOf(error),
  });

  console.error("Detailed error:", {
    message: error.message,
    code: error.code,
    stack: error.stack,
    name: error.name,
    validation: error.validation,
    statusCode: error.statusCode,
  });

  console.error("Request details:", {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  });

  reply.status(error.statusCode || 500).send({
    error: error.name || "Internal Server Error",
    message: error.message || "An unexpected error occurred",
    statusCode: error.statusCode || 500,
  });
}
