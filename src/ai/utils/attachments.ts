import type { FilePart, ImagePart, ModelMessage, SystemModelMessage } from "ai";

type UnknownWithType = { type?: unknown };
type UnknownImage = { image?: unknown };
type UnknownFileExtras = { mediaType?: string; mimeType?: string; url?: unknown; data?: unknown };
type UnknownFilePart = FilePart & UnknownFileExtras;
const MAX_ATTACHMENT_REFERENCE_LENGTH = 512;
const MAX_ATTACHMENTS_IN_PROMPT = 25;

const isImagePart = (p: unknown): p is ImagePart =>
  !!p && typeof p === "object" && (p as UnknownWithType).type === "image";
const isFilePart = (p: unknown): p is FilePart =>
  !!p && typeof p === "object" && (p as UnknownWithType).type === "file";

function toUrlString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof URL) return value.toString();
  return null;
}

function getMediaType(part: UnknownFilePart): string | null {
  return part.mediaType ?? part.mimeType ?? null;
}

function getFileUrlOrData(part: UnknownFilePart): string | null {
  // Prefer explicit URL if provided; fall back to data (can be data: URL)
  return toUrlString(part.url) ?? toUrlString(part.data);
}

function getAttachmentInfo(part: unknown): { kind: "image" | "video"; url: string | null } | null {
  if (isImagePart(part)) {
    const url = toUrlString((part as unknown as UnknownImage).image);
    return { kind: "image", url };
  }
  if (isFilePart(part)) {
    const file = part as UnknownFilePart;
    const mediaType = getMediaType(file);
    if (typeof mediaType !== "string") return null;
    if (mediaType.startsWith("image/")) {
      return { kind: "image", url: getFileUrlOrData(file) };
    }
    if (mediaType.startsWith("video/")) {
      return { kind: "video", url: getFileUrlOrData(file) };
    }
  }
  return null;
}

function formatAttachmentReference(kind: "image" | "video", url: string | null): string {
  if (!url || url.startsWith("data:")) return `(inline ${kind})`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `(inline ${kind})`;
    }
    const normalized = `${parsed.origin}${parsed.pathname}`;
    if (normalized.length <= MAX_ATTACHMENT_REFERENCE_LENGTH) {
      return normalized;
    }
    return `${normalized.slice(0, MAX_ATTACHMENT_REFERENCE_LENGTH - 3)}...`;
  } catch {
    return `(inline ${kind})`;
  }
}

export function extractAttachments(messages: ModelMessage[]): string[] {
  const out: string[] = [];
  outer: for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      const info = getAttachmentInfo(part);
      if (!info) continue;
      const label = info.kind === "image" ? "Image" : "Video";
      const reference = formatAttachmentReference(info.kind, info.url);
      out.push(`[${label}](${reference})`);
      if (out.length >= MAX_ATTACHMENTS_IN_PROMPT) {
        break outer;
      }
    }
  }
  return out;
}

export function getAttachmentsPrompt(messages: ModelMessage[]): SystemModelMessage | null {
  const attachments = extractAttachments(messages);
  if (attachments.length === 0) return null;

  return {
    role: "system",
    content: `Here is the list of all the attachments: ${JSON.stringify(attachments)}`,
  };
}

// Only user messages can include image/file uploads; remove video files there.
// Leave assistant (text/tool-call) and tool (tool-result only) unchanged.
export function getMessagesWithoutVideos(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" || typeof m.content === "string") return m;
    const parts = m.content.filter((p) => {
      const info = getAttachmentInfo(p);
      return !(info && info.kind === "video");
    });
    // This remains (TextPart | ImagePart | FilePart)[] which is valid for user content
    return { ...m, content: parts };
  });
}
