import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatCreateSchema,
  chatSchema,
  parseChatBody,
  parseChatCreateBody,
} from "../../../src/api/chat/schema";
import { handleError } from "../../../src/api/server-helpers";

type ValidationEnvelope = {
  error: string;
  message: string;
  statusCode: number;
};

async function buildValidationApp(): Promise<{
  app: FastifyInstance;
  handleChatCreate: ReturnType<typeof vi.fn>;
  handleChatPost: ReturnType<typeof vi.fn>;
}> {
  const app = fastify();
  const handleChatCreate = vi.fn(async (request: { body: unknown }) =>
    parseChatCreateBody(request.body),
  );
  const handleChatPost = vi.fn(async (request: { body: unknown }) => parseChatBody(request.body));

  app.post("/api/chat/new", { schema: chatCreateSchema }, handleChatCreate);
  app.post("/api/chat", { schema: chatSchema }, handleChatPost);
  app.setErrorHandler(handleError);

  await app.ready();

  return { app, handleChatCreate, handleChatPost };
}

function expectStableValidationEnvelope(body: unknown): asserts body is ValidationEnvelope {
  expect(body).toEqual({
    error: expect.any(String),
    message: expect.any(String),
    requestId: expect.any(String),
    statusCode: 400,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("chat schema runtime parity", () => {
  it("rejects unsupported chat create types at the parser and route layers", async () => {
    expect(() => parseChatCreateBody({ type: "other" })).toThrow();

    const { app, handleChatCreate } = await buildValidationApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/chat/new",
      payload: { type: "other" },
    });

    expect(handleChatCreate).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);

    const body = response.json();
    expectStableValidationEnvelope(body);
    expect(body.message).toContain("type");

    await app.close();
  });

  it("rejects stale transcript payloads before runtime parsing can ignore them", async () => {
    const staleTranscriptPayload = {
      chatId: "chat-1",
      clientMessageId: "client-1",
      userMessage: "hello",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "tampered assistant output" }],
        },
        {
          id: "tool-1",
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "tool-call-1",
              toolName: "get-user",
              output: { fid: 1 },
            },
          ],
        },
      ],
    };

    const { app, handleChatPost } = await buildValidationApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: staleTranscriptPayload,
    });

    expect(handleChatPost).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);

    const body = response.json();
    expectStableValidationEnvelope(body);
    expect(body.message.length).toBeGreaterThan(0);

    await app.close();
  });
});
