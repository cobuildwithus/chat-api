#!/usr/bin/env bash
set -euo pipefail

repo_tools_join_lines() {
  local out_var="$1"
  shift
  local joined=""
  local item
  for item in "$@"; do
    joined+="${item}"$'\n'
  done
  printf -v "$out_var" '%s' "$joined"
  export "$out_var"
}

required_files=(
  "AGENTS.md"
  "ARCHITECTURE.md"
  "agent-docs/index.md"
  "agent-docs/PLANS.md"
  "agent-docs/PRODUCT_SENSE.md"
  "agent-docs/RELIABILITY.md"
  "agent-docs/SECURITY.md"
  "agent-docs/QUALITY_SCORE.md"
  "agent-docs/product-specs/index.md"
  "agent-docs/product-specs/chat-api-behavior.md"
  "agent-docs/references/README.md"
  "agent-docs/references/api-contracts.md"
  "agent-docs/references/data-infra-map.md"
  "agent-docs/references/runtime-ai-flow.md"
  "agent-docs/references/tool-catalog.md"
  "agent-docs/references/testing-ci-map.md"
  "agent-docs/prompts/simplify.md"
  "agent-docs/prompts/test-coverage-audit.md"
  "agent-docs/prompts/task-finish-review.md"
  "agent-docs/operations/completion-workflow.md"
  "agent-docs/generated/README.md"
  "agent-docs/generated/doc-inventory.md"
  "agent-docs/generated/doc-gardening-report.md"
  "agent-docs/exec-plans/active/README.md"
  "agent-docs/exec-plans/active/COORDINATION_LEDGER.md"
  "agent-docs/exec-plans/completed/README.md"
  "agent-docs/exec-plans/tech-debt-tracker.md"
)
repo_tools_join_lines COBUILD_DRIFT_REQUIRED_FILES "${required_files[@]}"
export COBUILD_DRIFT_CODE_CHANGE_PATTERN='^(src/|migrations/|scripts/|\\.github/workflows/|docs/TOOLS\\.md$|package\\.json$|tsconfig\\.json$|tsconfig\\.build\\.json$|vitest\\.config\\.ts$|README\\.md$|ARCHITECTURE\\.md$|AGENTS\\.md$)'
export COBUILD_DRIFT_CODE_CHANGE_LABEL='Architecture-sensitive code/process'
export COBUILD_DRIFT_LARGE_CHANGE_THRESHOLD='10'
export COBUILD_DRIFT_CHANGED_COUNT_EXCLUDE_PATTERN='^agent-docs/generated/|^agent-docs/exec-plans/(active|completed)/|^pnpm-lock\\.yaml$'
export COBUILD_DRIFT_ALLOW_RELEASE_ARTIFACTS_ONLY='0'
export COBUILD_COMMITTER_EXAMPLE='fix(chat-api): guard request context drift'
export COBUILD_DOC_GARDENING_EXTRA_TRACKED_PATHS=ARCHITECTURE.md$'\n'
