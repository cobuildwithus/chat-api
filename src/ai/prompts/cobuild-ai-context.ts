import { COBUILD_AI_CONTEXT_URL, getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";

export async function cobuildAiContextPrompt(): Promise<string> {
  const { data, error } = await getCobuildAiContextSnapshot();
  if (!data) {
    return `Cobuild live stats unavailable: ${error ?? "unknown error"}.`;
  }

  const promptText =
    typeof data.prompt === "string" && data.prompt.trim().length > 0
      ? data.prompt
      : "Unavailable.";

  return [
    "# Cobuild live stats (snapshot)",
    `Source: ${COBUILD_AI_CONTEXT_URL}`,
    "",
    "## API prompt (verbatim)",
    promptText,
    "",
    "## Full response JSON",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
    "",
    "Use the getCobuildAiContext tool to refresh when you need the most recent data.",
  ].join("\n");
}
