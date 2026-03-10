# Runtime AI Flow Reference

## Overview

Primary path: `POST /api/chat` in `src/api/chat/route.ts`.

## Execution Sequence

1. Resolve chat identity and load the stored chat type/data.
2. In parallel:
- run usage limiter (`src/ai/ai-rate.limit.ts`)
- build agent (`src/ai/agents/agent.ts`)
3. Append or rehydrate the authoritative user turn from DB-backed history (`src/chat/message-store.ts`).
4. Build stream messages from authoritative history/context (`src/api/chat/chat-helpers.ts`).
5. Persist pending assistant placeholder (`src/chat/message-store.ts`).
6. Call `streamText` with:
- model from `src/ai/ai.ts`
- agent system prompt from `src/ai/utils/agent-prompts.ts`
- tool set from `src/ai/tools/index.ts`
7. On completion, persist finalized assistant output and metadata.
8. Record usage counters asynchronously.
9. On error, mark pending message as failed.

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
- Discussion tools now include list/thread/semantic search and guarded reply publishing wrappers.
- Docs vector-store tool is conditionally included by env.
- Web search and file-search tool outputs are surfaced in the streamed response metadata.

## Failure Semantics

- Ownership/auth failures short-circuit before model call.
- Invalid or empty incoming turns return `400`.
- Duplicate finalized `clientMessageId` values return `409`.
- Usage overage short-circuits with `429`.
- Stream failures return normalized stream error text and mark pending state failed.
