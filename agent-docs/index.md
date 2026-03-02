# Chat API Agent Docs Index

Last verified: 2026-03-02 (discussion tools + semantic search + reply publish flow)

## Purpose

This index is the table of contents for durable, repository-local context that agents should use.

## Canonical Docs

| Path | Purpose | Source of truth | Owner | Review cadence | Criticality | Last verified |
| --- | --- | --- | --- | --- | --- | --- |
| `ARCHITECTURE.md` | Top-level module map, request flows, and runtime lifecycle. | `src/**` | Chat API Maintainer | Per architecture PR | High | 2026-03-02 |
| `agent-docs/design-docs/index.md` | Index for durable design/principles docs. | `agent-docs/design-docs/**` | Chat API Maintainer | Monthly | Medium | 2026-02-25 |
| `agent-docs/design-docs/core-beliefs.md` | Core beliefs for agent-first repository operations. | Team process + architecture decisions | Chat API Maintainer | Quarterly | Medium | 2026-02-25 |
| `agent-docs/product-specs/index.md` | Index for product/API behavior constraints. | `agent-docs/product-specs/**` | Chat API Maintainer | Monthly | High | 2026-02-25 |
| `agent-docs/product-specs/chat-api-behavior.md` | Contract-level API behavior and compatibility constraints. | `src/api/**`, `src/chat/**`, tests, route handlers | Chat API Maintainer | Per behavior-change PR | High | 2026-03-02 |
| `agent-docs/references/README.md` | Overview of internal and external reference packs. | `agent-docs/references/**` | Chat API Maintainer | Monthly | Medium | 2026-02-25 |
| `agent-docs/references/api-contracts.md` | Route schemas, runtime responses, and schema/runtime gaps. | `src/api/**/schema.ts`, handlers | Chat API Maintainer | Per route/schema change | High | 2026-03-02 |
| `agent-docs/references/runtime-ai-flow.md` | End-to-end request -> agent -> stream execution flow. | `src/api/chat/**`, `src/ai/**` | Chat API Maintainer | Per runtime flow change | High | 2026-03-02 |
| `agent-docs/references/tool-catalog.md` | Tool-by-tool contract, dependencies, and failure behavior. | `src/ai/tools/**`, `src/infra/**` | Chat API Maintainer | Per tool behavior change | High | 2026-03-02 |
| `agent-docs/references/data-infra-map.md` | Postgres/Redis/cache/timeout architecture and invariants. | `src/infra/**`, `src/config/env.ts` | Chat API Maintainer | Per infra/config change | High | 2026-03-02 |
| `agent-docs/references/testing-ci-map.md` | Verification and CI/local enforcement map. | `package.json`, `.github/workflows/**`, scripts | Chat API Maintainer | Per CI/process change | Medium | 2026-02-25 |
| `agent-docs/PLANS.md` | Plan workflow and storage conventions. | `agent-docs/exec-plans/**` | Chat API Maintainer | Per process change | Medium | 2026-02-25 |
| `agent-docs/PRODUCT_SENSE.md` | Product behavior and response-quality constraints. | API behavior + user-facing responses | Chat API Maintainer | Monthly | Medium | 2026-02-25 |
| `agent-docs/QUALITY_SCORE.md` | Quality posture tracker by subsystem. | Architecture docs + tests + audits | Chat API Maintainer | Bi-weekly | Medium | 2026-02-25 |
| `agent-docs/RELIABILITY.md` | Reliability and consistency guardrails + failure modes. | `src/**`, tests, runtime checks | Chat API Maintainer | Per reliability-affecting PR | High | 2026-02-25 |
| `agent-docs/SECURITY.md` | Security constraints, trust boundaries, and escalation rules. | Auth, grants, headers, data boundaries | Chat API Maintainer | Per security-affecting PR | High | 2026-03-02 |
| `agent-docs/operations/verification-and-runtime.md` | Verification commands, required-check matrix, and runtime guardrails. | `AGENTS.md`, `package.json`, `scripts/**` | Chat API Maintainer | Per process/CI change | High | 2026-02-25 |
| `agent-docs/operations/completion-workflow.md` | Required post-implementation audit workflow. | Prompts + completion process | Chat API Maintainer | Per process change | High | 2026-02-25 |
| `agent-docs/prompts/simplify.md` | Reusable simplification pass prompt. | Completion workflow | Chat API Maintainer | Per process change | Medium | 2026-02-25 |
| `agent-docs/prompts/test-coverage-audit.md` | Reusable coverage-audit prompt for high-risk changes. | Completion workflow | Chat API Maintainer | Per process change | High | 2026-02-25 |
| `agent-docs/prompts/task-finish-review.md` | Reusable final completion audit prompt. | Completion workflow | Chat API Maintainer | Per process change | High | 2026-02-25 |
| `agent-docs/generated/README.md` | Generated doc artifacts produced by scripts. | `agent-docs/generated/**` | Chat API Maintainer | Per script change | Medium | 2026-02-25 |
| `agent-docs/exec-plans/` | Execution plans for active and completed work. | PR-linked plan docs | Chat API Maintainer | Per multi-file/high-risk PR | High | 2026-02-25 |
| `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` | Active task ownership ledger for multi-agent safety. | Active coding sessions | Chat API Maintainer | Continuous | High | 2026-03-02 |
| `agent-docs/exec-plans/tech-debt-tracker.md` | Rolling debt register with owner/priority/status. | Audits, incidents, reviews | Chat API Maintainer | Bi-weekly | Medium | 2026-02-25 |

## Conventions

- Keep AGENTS files short and route-oriented.
- Update this index whenever docs are added, removed, or moved.
- Update this index when `agent-docs/references/api-contracts.md` route wiring changes.
- Buildbot tools auth/rate-limit prehandler ordering changes require updates to Architecture + Security + API Contracts docs in the same change.
- For multi-file/high-risk work, add a plan in `agent-docs/exec-plans/active/`.
- Keep `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` current during active coding work.
- Current active plan example: `agent-docs/exec-plans/active/2026-03-02-discussion-tools-semantic-search-reply-cast.md`.
