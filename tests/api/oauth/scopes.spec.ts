import { describe, expect, it } from "vitest";
import {
  defaultCliScope,
  hasAnyWriteCapability,
  hasToolsWrite,
  hasWalletExecute,
  hasWriteToolCapability,
  hasScope,
  normalizeScope,
  splitScope,
  validateScope,
} from "@cobuild/wire";

describe("oauth scope helpers", () => {
  it("parses/splits/normalizes scope strings", () => {
    expect(splitScope(" tools:read   wallet:read ")).toEqual(["tools:read", "wallet:read"]);
    expect(splitScope("tools:read offline_access")).toEqual(["tools:read", "offline_access"]);
    expect(normalizeScope("wallet:read tools:read tools:read")).toBe("tools:read wallet:read");
  });

  it("validates supported scopes and required offline_access", () => {
    expect(validateScope("tools:read wallet:read offline_access")).toBe(
      "offline_access tools:read wallet:read"
    );
    expect(() => validateScope("tools:read")).toThrow("scope must include offline_access");
    expect(() => validateScope("admin:all offline_access")).toThrow("Unsupported scope: admin:all");
    expect(() => validateScope("tools:read offline_access")).toThrow(
      "scope must match one of the supported read/write bundles, with or without notifications:read"
    );
  });

  it("checks individual and derived write scopes", () => {
    expect(hasScope("tools:read wallet:read", "wallet:read")).toBe(true);
    expect(hasScope("tools:read wallet:read", "wallet:execute")).toBe(false);
    expect(hasToolsWrite("tools:write offline_access")).toBe(true);
    expect(hasWalletExecute("wallet:execute offline_access")).toBe(true);
    expect(hasWriteToolCapability("tools:read wallet:execute offline_access")).toBe(false);
    expect(hasWriteToolCapability("tools:write offline_access")).toBe(false);
    expect(hasWriteToolCapability("tools:write wallet:execute offline_access")).toBe(true);
    expect(hasWriteToolCapability("tools:read wallet:read offline_access")).toBe(false);
    expect(hasAnyWriteCapability("wallet:execute offline_access")).toBe(true);
    expect(hasAnyWriteCapability("tools:read wallet:read offline_access")).toBe(false);
  });

  it("returns the default CLI scope string", () => {
    const scope = defaultCliScope();
    expect(scope).toContain("tools:read");
    expect(scope).toContain("wallet:read");
    expect(scope).toContain("offline_access");
    expect(scope).not.toContain("tools:write");
    expect(scope).not.toContain("wallet:execute");
  });
});
