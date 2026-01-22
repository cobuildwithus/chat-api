import { openAIProvider } from "../../ai";
import type { Tool } from "../tool";

const vectorStoreId = process.env.DOCS_VECTOR_STORE_ID?.trim();

export const docsFileSearchTool: Tool | null = vectorStoreId
  ? {
      name: "file_search",
      prompt: async () => `### Docs File Search Tool

Use this tool to search Cobuild docs via OpenAI file search.
- Query for key terms and concepts; results return relevant snippets.
- Use multiple short queries rather than one long query.
- If results are thin, rephrase with synonyms or narrower terms.`,
      tool: openAIProvider.tools.fileSearch({
        vectorStoreIds: [vectorStoreId],
        maxNumResults: 8,
      }),
    }
  : null;
