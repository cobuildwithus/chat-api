import { getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";

export async function cobuildAiContextPrompt(): Promise<string> {
  const { data, error } = await getCobuildAiContextSnapshot();
  if (!data) {
    return `Treasury stats unavailable: ${error ?? "unknown error"}.`;
  }
  const promptText =
    typeof data.prompt === "string" && data.prompt.trim().length > 0
      ? data.prompt
      : "Unavailable.";

  return [
    "# Treasury stats (snapshot)",
    "",
    "## API prompt (verbatim)",
    promptText,
    "",
    "## Full response JSON",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
    "",
    "Use the get-treasury-stats tool to refresh when you need the most recent data.",
  ].join("\n");
}
