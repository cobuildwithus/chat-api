import { describe, expect, it } from "vitest";
import {
  chatCreateSchema,
  chatGetSchema,
  chatListSchema,
  chatSchema,
  parseChatBody,
  parseChatCreateBody,
  parseChatHeaders,
  parseChatListQuery,
  sanitizeStoredChatData,
} from "../../../src/api/chat/schema";

describe("chat schemas", () => {
  it("defines the append-only chat post contract", () => {
    const bodySchema = chatSchema.body as {
      required: string[];
      properties: Record<string, { type?: string; enum?: string[] }>;
    };
    const headersSchema = chatSchema.headers as {
      properties: Record<string, unknown>;
    };

    expect(bodySchema.required).toEqual(["chatId", "clientMessageId", "userMessage"]);
    expect(bodySchema.properties.chatId.type).toBe("string");
    expect(bodySchema.properties.clientMessageId.type).toBe("string");
    expect(bodySchema.properties.userMessage.type).toBe("string");
    expect(headersSchema.properties["x-client-device"]).toBeDefined();
  });

  it("defines create, get, and list schemas", () => {
    const createSchema = chatCreateSchema.body as {
      required: string[];
      properties: { type: { enum: string[] } };
    };
    const getSchema = chatGetSchema.params as { required: string[] };
    const listSchema = chatListSchema.querystring as {
      properties: Record<string, { maximum?: number }>;
    };

    expect(createSchema.required).toEqual(["type"]);
    expect(createSchema.properties.type.enum).toEqual(["chat-default"]);
    expect(getSchema.required).toEqual(["chatId"]);
    expect(listSchema.properties.limit.maximum).toBe(100);
    expect(listSchema.properties.goalAddress).toBeUndefined();
  });

  it("uses the same runtime parsers as the generated schemas", () => {
    expect(
      parseChatBody({
        chatId: "chat-1",
        clientMessageId: "client-1",
        userMessage: "hello",
      }),
    ).toEqual({
      chatId: "chat-1",
      clientMessageId: "client-1",
      userMessage: "hello",
    });
    expect(() =>
      parseChatBody({
        chatId: "chat-1",
        clientMessageId: "client-1",
      }),
    ).toThrow();
    expect(parseChatHeaders({ "x-client-device": "mobile" })).toEqual({
      "x-client-device": "mobile",
    });
    expect(
      sanitizeStoredChatData({
        goalAddress: "0xgoal",
        ignored: 7,
        impactId: 7,
        grantId: "grant-1",
      }),
    ).toEqual({
      goalAddress: "0xgoal",
      grantId: "grant-1",
    });
    expect(sanitizeStoredChatData("{not-an-object}")).toEqual({});
    expect(parseChatListQuery({ limit: "7" })).toEqual({ limit: 7 });
    expect(() => parseChatListQuery({ goalAddress: "0xgoal" })).toThrow();
    expect(() => parseChatCreateBody({ type: "other" })).toThrow();
  });
});
