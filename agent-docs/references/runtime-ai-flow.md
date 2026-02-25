# Runtime AI Flow Reference

## Overview

Primary path: `POST /api/chat` in `src/api/chat/route.ts`.

## Execution Sequence

1. Resolve chat identity and validate/refresh grant.
2. In parallel:
- run usage limiter (`src/ai/ai-rate.limit.ts`)
- build agent (`src/ai/agents/agent.ts`)
3. Build stream messages from prior history/context (`src/api/chat/chat-helpers.ts`).
4. Persist pending assistant placeholder (`src/chat/message-store.ts`).
5. Call `streamText` with:
- model from `src/ai/ai.ts`
- agent system prompt from `src/ai/utils/agent-prompts.ts`
- tool set from `src/ai/tools/index.ts`
6. On completion, persist finalized assistant output and metadata.
7. Record usage counters asynchronously.
8. On error, mark pending message as failed.

## Prompt Assembly Order

`src/ai/utils/agent-prompts.ts` composes:

1. About/manifesto/personality prompt blocks
2. Tool usage instruction blocks
3. Goal + context + user data prompts

## Agent Selection

- Selector: `src/ai/agents/agent.ts`
- Runtime support: `chat-default`
- Unknown types throw, so client/request contracts should avoid unsupported values.

## Tool Integration Notes

- Tools are registered once in `defaultTools`.
- Docs vector-store tool is conditionally included by env.
- Web search and file-search tool outputs are surfaced in the streamed response metadata.

## Failure Semantics

- Ownership/auth failures short-circuit before model call.
- Usage overage short-circuits with `429`.
- Stream failures return normalized stream error text and mark pending state failed.
