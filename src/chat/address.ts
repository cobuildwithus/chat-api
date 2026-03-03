import { getAddress } from "viem";

export function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return getAddress(trimmed).toLowerCase();
  } catch {
    return null;
  }
}

export function isSameAddress(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}
