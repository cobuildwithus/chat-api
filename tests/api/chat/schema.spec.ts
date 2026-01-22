import { describe, expect, it } from "vitest";
import {
  chatCreateSchema,
  chatGetSchema,
  chatListSchema,
  chatSchema,
} from "../../../src/api/chat/schema";

describe("chat schemas", () => {
  it("includes required properties for chat payloads", () => {
    expect(chatSchema.body.required).toContain("id");
    expect(chatSchema.body.required).toContain("messages");
    expect(chatSchema.body.properties.messages.type).toBe("array");
  });

  it("defines create, get, and list schemas", () => {
    expect(chatCreateSchema.body.required).toEqual(["type"]);
    expect(chatGetSchema.params.required).toEqual(["chatId"]);
    expect(chatListSchema.querystring.properties.limit.maximum).toBe(100);
  });
});
