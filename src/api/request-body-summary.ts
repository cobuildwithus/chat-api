type SummarizeRequestBodyOptions = {
  includeQueryLength?: boolean;
  includeLimit?: boolean;
};

export function summarizeRequestBody(
  body: unknown,
  options: SummarizeRequestBodyOptions = {},
): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (typeof record.type === "string") summary.type = record.type;
  if (typeof record.id === "string") summary.id = record.id;
  if (Array.isArray(record.messages)) summary.messageCount = record.messages.length;
  if (record.data && typeof record.data === "object") {
    summary.dataKeys = Object.keys(record.data as Record<string, unknown>);
  }
  if (options.includeQueryLength && typeof record.query === "string") {
    summary.queryLength = record.query.length;
  }
  if (options.includeLimit && typeof record.limit === "number") {
    summary.limit = record.limit;
  }

  return Object.keys(summary).length > 0 ? summary : null;
}
