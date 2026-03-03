export const oauthAuthorizeCodeSchema = {
  body: {
    type: "object",
    required: [
      "client_id",
      "redirect_uri",
      "scope",
      "code_challenge",
      "code_challenge_method",
      "state",
      "agent_key",
    ],
    properties: {
      client_id: { type: "string", minLength: 1, maxLength: 64 },
      redirect_uri: { type: "string", minLength: 1, maxLength: 2048 },
      scope: { type: "string", minLength: 1, maxLength: 1024 },
      code_challenge: { type: "string", minLength: 43, maxLength: 128 },
      code_challenge_method: { type: "string", minLength: 1, maxLength: 16 },
      state: { type: "string", minLength: 8, maxLength: 512 },
      agent_key: {
        type: "string",
        minLength: 1,
        maxLength: 64,
        pattern: "^[A-Za-z0-9._-]+$",
      },
      label: { type: "string", minLength: 1, maxLength: 128 },
    },
    additionalProperties: false,
  },
} as const;

export const oauthTokenSchema = {
  body: {
    type: "object",
    required: ["grant_type", "client_id"],
    properties: {
      grant_type: { type: "string", minLength: 1, maxLength: 64 },
      client_id: { type: "string", minLength: 1, maxLength: 64 },
      code: { type: "string", minLength: 1, maxLength: 512 },
      redirect_uri: { type: "string", minLength: 1, maxLength: 2048 },
      code_verifier: { type: "string", minLength: 43, maxLength: 128 },
      refresh_token: { type: "string", minLength: 1, maxLength: 1024 },
    },
    additionalProperties: false,
  },
} as const;

export const cliSessionsListSchema = {} as const;

export const cliSessionRevokeSchema = {
  body: {
    type: "object",
    required: ["sessionId"],
    properties: {
      sessionId: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;
