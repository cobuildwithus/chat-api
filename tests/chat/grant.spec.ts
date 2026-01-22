import { beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { signChatGrant, verifyChatGrant } from "../../src/chat/grant";

beforeEach(() => {
  process.env.CHAT_GRANT_SECRET = "test-chat-grant-secret";
});

describe("chat grants", () => {
  it("signs and verifies a valid grant", async () => {
    const token = await signChatGrant("chat-1", "0xabc");
    const payload = await verifyChatGrant(token);
    expect(payload).toEqual({
      cid: "chat-1",
      perm: "send",
      sub: "0xabc",
    });
  });

  it("returns null for invalid tokens", async () => {
    const payload = await verifyChatGrant("invalid.token");
    expect(payload).toBeNull();
  });

  it("returns null for invalid payload fields", async () => {
    const badPerm = await new SignJWT({ cid: "chat-1", perm: "read" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("0xabc")
      .setIssuer("cobuild-chat")
      .setAudience("cobuild-chat")
      .sign(new TextEncoder().encode(process.env.CHAT_GRANT_SECRET));

    await expect(verifyChatGrant(badPerm)).resolves.toBeNull();

    const missingSubject = await new SignJWT({ cid: "chat-1", perm: "send" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("cobuild-chat")
      .setAudience("cobuild-chat")
      .sign(new TextEncoder().encode(process.env.CHAT_GRANT_SECRET));

    await expect(verifyChatGrant(missingSubject)).resolves.toBeNull();
  });
});
