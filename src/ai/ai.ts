import { createOpenAI } from "@ai-sdk/openai";
import { getOpenAiTimeoutMs } from "../config/env";
import { createTimeoutFetch } from "../infra/http/timeout";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: createTimeoutFetch({ timeoutMs: getOpenAiTimeoutMs(), name: "OpenAI" }),
});

export const openAIProvider = openai;
export const openAIModel = openai.responses("gpt-5.2-2025-12-11");
export const openAIModel5Mini = openai.responses("gpt-5-mini-2025-08-07");
