import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const openAIProvider = openai;
export const openAIModel = openai.responses("gpt-5.2-2025-12-11");
export const openAIModel5Mini = openai.responses("gpt-5-mini-2025-08-07");
