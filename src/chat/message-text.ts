import type { UIMessage } from "ai";

type TextPart = { type: "text"; text: string };

export function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts.filter(isTextPart).map((part) => part.text).join("");
}

export function getFirstUserText(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = extractTextFromParts(message.parts);
    if (text) return text;
  }
  return null;
}

function isTextPart(part: unknown): part is TextPart {
  return (
    !!part &&
    typeof part === "object" &&
    (part as { type?: string }).type === "text" &&
    typeof (part as { text?: string }).text === "string"
  );
}
