export const toolExecutionSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 128 },
      input: {
        type: "object",
        additionalProperties: true,
      },
    },
    additionalProperties: false,
  },
} as const;

export const toolsListSchema = {} as const;

export const toolMetadataSchema = {
  params: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 128 },
    },
    additionalProperties: false,
  },
} as const;
