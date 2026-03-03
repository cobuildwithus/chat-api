const SUPPORTED_SCOPES = [
  "tools:read",
  "tools:write",
  "wallet:read",
  "wallet:execute",
  "offline_access",
] as const;

const REQUIRED_AUTHORIZE_SCOPES = ["offline_access"] as const;

export type CliOAuthScope = (typeof SUPPORTED_SCOPES)[number];

const supportedScopeSet = new Set<string>(SUPPORTED_SCOPES);

export function parseScopeString(scope: string): string[] {
  return scope
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeScope(scope: string): string {
  return Array.from(new Set(parseScopeString(scope))).sort().join(" ");
}

export function validateScope(scope: string): string {
  const parsed = Array.from(new Set(parseScopeString(scope)));
  if (parsed.length === 0) {
    throw new Error("scope must include at least one entry");
  }

  for (const value of parsed) {
    if (!supportedScopeSet.has(value)) {
      throw new Error(`Unsupported scope: ${value}`);
    }
  }

  for (const required of REQUIRED_AUTHORIZE_SCOPES) {
    if (!parsed.includes(required)) {
      throw new Error(`scope must include ${required}`);
    }
  }

  return parsed.sort().join(" ");
}

export function hasScope(scope: string, required: string): boolean {
  return parseScopeString(scope).includes(required);
}

export function canWriteFromScope(scope: string): boolean {
  const parsed = parseScopeString(scope);
  return parsed.includes("tools:write") || parsed.includes("wallet:execute");
}

export function splitScope(scope: string): string[] {
  return parseScopeString(scope);
}

export function defaultCliScope(): string {
  return SUPPORTED_SCOPES.join(" ");
}
