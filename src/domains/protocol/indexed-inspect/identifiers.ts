import { getAddress, isAddress } from "viem";

const GOAL_STATE_LABELS = ["Funding", "Active", "Succeeded", "Expired"] as const;
const BUDGET_STATE_LABELS = ["Funding", "Active", "Succeeded", "Failed", "Expired"] as const;

export type GoalStateLabel = (typeof GOAL_STATE_LABELS)[number];
export type BudgetStateLabel = (typeof BUDGET_STATE_LABELS)[number];

export { GOAL_STATE_LABELS, BUDGET_STATE_LABELS };

export function normalizeHexAddress(value: string): string {
  return getAddress(value).toLowerCase();
}

export function normalizeLookupIdentifier(value: string): string {
  return value.trim();
}

export function normalizeGoalLookupKey(value: string): string {
  return normalizeLookupIdentifier(value).toLowerCase();
}

export function normalizeIndexedIdentifier(value: string): string {
  return normalizeLookupIdentifier(value).toLowerCase();
}

export function normalizeOptionalHexLike(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.toLowerCase();
}

export function normalizeAccountLookup(value: string): string {
  const normalized = normalizeLookupIdentifier(value);
  return isAddress(normalized, { strict: false }) ? normalizeHexAddress(normalized) : normalized.toLowerCase();
}

export function compositeIdEndsWithAddress(id: string | null | undefined, address: string | null | undefined): boolean {
  if (!id || !address) return false;
  return id.toLowerCase().endsWith(`:${address.toLowerCase()}`);
}

export function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

export function toStateCode(code: number | null | undefined): number | null {
  return typeof code === "number" ? code : null;
}

export function goalStateLabel(code: number | null | undefined): GoalStateLabel | null {
  const safeCode = toStateCode(code);
  return safeCode !== null && safeCode >= 0 && safeCode < GOAL_STATE_LABELS.length
    ? GOAL_STATE_LABELS[safeCode]
    : null;
}

export function budgetStateLabel(code: number | null | undefined): BudgetStateLabel | null {
  const safeCode = toStateCode(code);
  return safeCode !== null && safeCode >= 0 && safeCode < BUDGET_STATE_LABELS.length
    ? BUDGET_STATE_LABELS[safeCode]
    : null;
}

export function subtractAmounts(left: string | null | undefined, right: string | null | undefined): string | null {
  if (!left && !right) return null;
  try {
    return (BigInt(left ?? "0") - BigInt(right ?? "0")).toString();
  } catch {
    return null;
  }
}

export function buildTcrItemId(tcrAddress: string, itemId: string): string {
  return `${normalizeOptionalHexLike(tcrAddress)}:${normalizeOptionalHexLike(itemId)}`;
}

export function buildTcrRequestId(tcrAddress: string, itemId: string, requestIndex: string): string {
  return `${normalizeOptionalHexLike(tcrAddress)}:${normalizeOptionalHexLike(itemId)}:${requestIndex}`;
}

export function buildPremiumAccountId(escrowAddress: string, account: string): string {
  return `${normalizeOptionalHexLike(escrowAddress)}:${normalizeAccountLookup(account)}`;
}
