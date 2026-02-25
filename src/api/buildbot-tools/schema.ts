const castEmbedSchema = {
  type: "object",
  required: ["url"],
  properties: {
    url: { type: "string", minLength: 1, maxLength: 2048 },
  },
  additionalProperties: false,
} as const;

export const buildBotToolsGetUserSchema = {
  body: {
    type: "object",
    required: ["fname"],
    properties: {
      fname: { type: "string", minLength: 1, maxLength: 64 },
    },
    additionalProperties: false,
  },
} as const;

export const buildBotToolsGetCastSchema = {
  body: {
    type: "object",
    required: ["identifier", "type"],
    properties: {
      identifier: { type: "string", minLength: 1, maxLength: 2048 },
      type: { type: "string", enum: ["hash", "url"] },
    },
    additionalProperties: false,
  },
} as const;

export const buildBotToolsCastPreviewSchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1, maxLength: 1024 },
      embeds: {
        type: "array",
        items: castEmbedSchema,
        maxItems: 2,
      },
      parent: { type: "string", minLength: 1, maxLength: 512 },
    },
    additionalProperties: false,
  },
} as const;

export const buildBotToolsCobuildAiContextSchema = {
  body: {
    type: "object",
    additionalProperties: false,
  },
} as const;
