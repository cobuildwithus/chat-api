import { describe, expect, it } from "vitest";
import { extractAttachments, getAttachmentsPrompt, getMessagesWithoutVideos } from "../../../src/ai/utils/attachments";

const baseMessages = [
  {
    role: "user",
    content: [
      { type: "text", text: "hello" },
      { type: "image", image: "https://image" },
      { type: "file", data: "https://video", mediaType: "video/mp4" },
      { type: "file", url: "https://image2", mediaType: "image/png" },
    ],
  },
  {
    role: "assistant",
    content: "ok",
  },
];

describe("attachments", () => {
  it("extracts attachments and builds prompt", () => {
    const attachments = extractAttachments(baseMessages as any);
    expect(attachments).toEqual([
      "[Image](https://image)",
      "[Video](https://video)",
      "[Image](https://image2)",
    ]);

    const prompt = getAttachmentsPrompt(baseMessages as any);
    expect(prompt?.content).toContain("attachments");
  });

  it("removes video parts from user messages", () => {
    const cleaned = getMessagesWithoutVideos(baseMessages as any);
    const userParts = cleaned[0].content as Array<{ type: string; mediaType?: string }>;
    expect(userParts.find((part) => part.mediaType?.startsWith("video/"))).toBeUndefined();
  });
});
