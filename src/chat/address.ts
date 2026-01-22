const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ADDRESS_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function isSameAddress(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}
