export const chatSchema = {
  body: {
    type: "object",
    required: ["id", "messages", "type"],
    properties: {
      id: { type: "string" },
      clientMessageId: { type: "string" },
      messages: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "role", "parts"],
          properties: {
            id: { type: "string" },
            role: { enum: ["system", "user", "assistant"] },
            metadata: {
              type: "object",
              additionalProperties: true,
            },
            parts: {
              type: "array",
              items: {
                oneOf: [
                  {
                    type: "object",
                    required: ["type", "text"],
                    properties: {
                      type: { const: "text" },
                      text: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "text"],
                    properties: {
                      type: { const: "reasoning" },
                      text: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "url", "mediaType"],
                    properties: {
                      type: { const: "file" },
                      url: { type: "string" },
                      mediaType: { type: "string" },
                      filename: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "image"],
                    properties: {
                      type: { const: "image" },
                      image: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type"],
                    properties: {
                      type: { const: "step-start" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "sourceId", "url"],
                    properties: {
                      type: { const: "source-url" },
                      sourceId: { type: "string" },
                      url: { type: "string" },
                      title: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "sourceId", "mediaType", "title"],
                    properties: {
                      type: { const: "source-document" },
                      sourceId: { type: "string" },
                      mediaType: { type: "string" },
                      title: { type: "string" },
                      filename: { type: "string" },
                      url: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "toolCallId", "state"],
                    properties: {
                      type: { type: "string", pattern: "^tool-" },
                      toolCallId: { type: "string" },
                      state: {
                        enum: [
                          "input-streaming",
                          "input-available",
                          "output-available",
                          "output-error",
                        ],
                      },
                      input: {},
                      output: {},
                      errorText: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "toolName", "toolCallId", "state"],
                    properties: {
                      type: { const: "dynamic-tool" },
                      toolName: { type: "string" },
                      toolCallId: { type: "string" },
                      state: {
                        enum: [
                          "input-streaming",
                          "input-available",
                          "output-available",
                          "output-error",
                        ],
                      },
                      input: {},
                      output: {},
                      errorText: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                  {
                    type: "object",
                    required: ["type", "data"],
                    properties: {
                      type: { type: "string", pattern: "^data-" },
                      id: { type: "string" },
                      data: {},
                    },
                    additionalProperties: true,
                  },
                ],
              },
            },
          },
          additionalProperties: true,
        },
      },
      type: { type: "string" },
      data: {
        type: "object",
        additionalProperties: true,
      },
      context: { type: "string" },
    },
    additionalProperties: true,
  },
};

export const chatCreateSchema = {
  body: {
    type: "object",
    required: ["type"],
    properties: {
      type: { type: "string" },
      data: {
        type: "object",
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  },
};

export const chatGetSchema = {
  params: {
    type: "object",
    required: ["chatId"],
    properties: {
      chatId: { type: "string" },
    },
  },
};

export const chatListSchema = {
  querystring: {
    type: "object",
    properties: {
      goalAddress: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 100 },
    },
  },
};
