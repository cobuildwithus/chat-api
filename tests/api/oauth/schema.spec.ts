import { describe, expect, it } from "vitest";
import {
  cliOAuthAuthorizeCodeRequestBodyJsonSchema,
  cliOAuthTokenRequestBodyJsonSchema,
} from "@cobuild/wire";
import {
  cliSessionRevokeSchema,
  oauthAuthorizeCodeSchema,
  oauthTokenSchema,
  parseCliSessionRevokeBody,
  parseOauthAuthorizeCodeBody,
  parseOauthTokenBody,
} from "../../../src/api/oauth/schema";

describe("oauth schemas", () => {
  it("defines authorization code request requirements", () => {
    expect(oauthAuthorizeCodeSchema.body).toEqual(cliOAuthAuthorizeCodeRequestBodyJsonSchema);
  });

  it("defines token and session revoke request requirements", () => {
    const revokeBodySchema = cliSessionRevokeSchema.body as {
      required: string[];
      additionalProperties: boolean;
    };

    expect(oauthTokenSchema.body).toEqual(cliOAuthTokenRequestBodyJsonSchema);
    expect(revokeBodySchema.additionalProperties).toBe(false);
    expect(revokeBodySchema.required).toEqual(["sessionId"]);
  });

  it("uses shared runtime parsers for oauth requests", () => {
    expect(
      parseOauthAuthorizeCodeBody({
        client_id: "cli",
        redirect_uri: "http://127.0.0.1:4545/auth/callback",
        scope: "wallet:read tools:read offline_access",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
        state: "state-123",
        agent_key: "default",
      }),
    ).toEqual({
      clientId: "cli",
      redirectUri: "http://127.0.0.1:4545/auth/callback",
      scope: "offline_access tools:read wallet:read",
      codeChallenge: "a".repeat(43),
      codeChallengeMethod: "S256",
      state: "state-123",
      agentKey: "default",
    });
    expect(parseOauthTokenBody({ grant_type: "refresh_token", client_id: "cli" })).toEqual({
      grantType: "refresh_token",
      clientId: "cli",
    });
    expect(parseCliSessionRevokeBody({ sessionId: "session-1" })).toEqual({
      sessionId: "session-1",
    });
    expect(() => parseOauthTokenBody({ grant_type: "refresh_token", client_id: "cli", extra: true })).toThrow();
    expect(() => parseCliSessionRevokeBody({ sessionId: "session-1", extra: true })).toThrow();
  });
});
