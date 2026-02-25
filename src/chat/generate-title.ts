import { generateText } from "ai";
import { openAIModel5Mini } from "../ai/ai";

const TITLE_PROMPT = `You create short, clear titles for chat threads.
Return a concise title (2-6 words) based on the conversation history.
Do not use quotes, emojis, or trailing punctuation.
Always write "Cobuild" with that capitalization (never "COBUILD").`;

export async function generateChatTitle(message: string): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const result = await generateText({
    model: openAIModel5Mini,
    providerOptions: {
      openai: {
        reasoningEffort: "medium",
      },
    },
    messages: [
      { role: "system", content: TITLE_PROMPT },
      { role: "user", content: trimmed.slice(0, 800) },
    ],
  });

  const title = result.text.trim().replace(/^"|"$/g, "");
  if (!title) {
    console.info("Chat title generation returned empty text.", {
      messageLength: trimmed.length,
      finishReason: result.finishReason,
      rawFinishReason: result.rawFinishReason,
      warnings: result.warnings,
      usage: result.usage,
      totalUsage: result.totalUsage,
      providerMetadata: result.providerMetadata,
      responseMessages: result.response?.messages?.length ?? null,
    });
  }
  return title || null;
}
