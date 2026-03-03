const DEFAULT_ERROR_MAX_CHARS = 120;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function formatErrorMessage(
  error: unknown,
  maxLength: number = DEFAULT_ERROR_MAX_CHARS,
): string {
  if (error instanceof Error && error.message) {
    return truncate(error.message, maxLength);
  }
  if (typeof error === "string") return truncate(error, maxLength);
  return "Unknown error";
}
