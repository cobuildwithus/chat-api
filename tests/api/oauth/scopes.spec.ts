import { describe, expect, it } from "vitest";
import {
  canWriteFromScope,
  defaultCliScope,
  hasScope,
  normalizeScope,
  parseScopeString,
  splitScope,
  validateScope,
} from "../../../src/api/oauth/scopes";

describe("oauth scope helpers", () => {
  it("parses/splits/normalizes scope strings", () => {
    expect(parseScopeString(" tools:read   wallet:read ")).toEqual(["tools:read", "wallet:read"]);
    expect(splitScope("tools:read offline_access")).toEqual(["tools:read", "offline_access"]);
    expect(normalizeScope("wallet:read tools:read tools:read")).toBe("tools:read wallet:read");
  });

  it("validates supported scopes and required offline_access", () => {
    expect(validateScope("tools:read offline_access")).toBe("offline_access tools:read");
    expect(() => validateScope("tools:read")).toThrow("scope must include offline_access");
    expect(() => validateScope("admin:all offline_access")).toThrow("Unsupported scope: admin:all");
  });

  it("checks individual and derived write scopes", () => {
    expect(hasScope("tools:read wallet:read", "wallet:read")).toBe(true);
    expect(hasScope("tools:read wallet:read", "wallet:execute")).toBe(false);
    expect(canWriteFromScope("tools:read wallet:execute offline_access")).toBe(true);
    expect(canWriteFromScope("tools:write offline_access")).toBe(true);
    expect(canWriteFromScope("tools:read wallet:read offline_access")).toBe(false);
  });

  it("returns the default CLI scope string", () => {
    const scope = defaultCliScope();
    expect(scope).toContain("tools:read");
    expect(scope).toContain("tools:write");
    expect(scope).toContain("wallet:read");
    expect(scope).toContain("wallet:execute");
    expect(scope).toContain("offline_access");
  });
});
