const DEFAULT_ERROR_MAX_CHARS = 120;
const DEFAULT_PUBLIC_ERROR_MESSAGE = "Request failed.";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeErrorText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function formatErrorLogMessage(
  error: unknown,
  maxLength: number = DEFAULT_ERROR_MAX_CHARS,
): string {
  if (error instanceof Error && error.message) {
    return truncate(normalizeErrorText(error.message), maxLength);
  }
  if (typeof error === "string") {
    return truncate(normalizeErrorText(error), maxLength);
  }
  return "Unknown error";
}

export function formatErrorMessage(
  _error: unknown,
  maxLength: number | undefined = DEFAULT_ERROR_MAX_CHARS,
  fallback: string = DEFAULT_PUBLIC_ERROR_MESSAGE,
): string {
  return truncate(normalizeErrorText(fallback), maxLength ?? DEFAULT_ERROR_MAX_CHARS);
}
