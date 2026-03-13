#!/usr/bin/env bash
name_prefix="cobuild-chat-api-chatgpt-audit"
include_tests=1
include_docs=1
preset_dir="scripts/chatgpt-review-presets"
package_script="scripts/package-audit-context.sh"

review_gpt_register_dir_preset "security" "security.md" \
  "Node/API security review (headers, auth, secrets, trust boundaries)."
review_gpt_register_dir_preset "security-audit" "security-audit.md" \
  "Deep auth + grant + endpoint security pass." \
  "audit-security"
review_gpt_register_dir_preset "simplify" "complexity-simplification.md" \
  "Complexity and behavior-preserving simplification opportunities." \
  "complexity" \
  "complexity-simplification"
review_gpt_register_dir_preset "bad-code" "bad-code-quality.md" \
  "Combined code quality and anti-pattern pass." \
  "anti-patterns" \
  "antipatterns" \
  "bad-practices" \
  "anti-patterns-and-bad-practices" \
  "code-quality" \
  "bad-code-quality"
review_gpt_register_dir_preset "reliability" "reliability.md" \
  "Timeouts, retries, streaming lifecycle, and failure safety." \
  "reliability-audit"
review_gpt_register_dir_preset "test-gaps" "test-gaps.md" \
  "Highest-impact missing test coverage for changed behavior." \
  "coverage" \
  "coverage-gaps"
review_gpt_register_dir_preset "api-contracts" "api-contracts.md" \
  "Request/response schema and runtime compatibility audit." \
  "contracts" \
  "api"
review_gpt_register_dir_preset "auth-grants" "auth-grants.md" \
  "JWT, ownership, and grant lifecycle enforcement review." \
  "auth" \
  "grants" \
  "authorization"
review_gpt_register_dir_preset "tool-safety" "tool-safety.md" \
  "Tool invocation and external integration safety review." \
  "tools" \
  "integrations"
