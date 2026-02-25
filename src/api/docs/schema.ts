export const docsSearchSchema = {
  body: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1 },
      limit: { type: "number", minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
  },
};

