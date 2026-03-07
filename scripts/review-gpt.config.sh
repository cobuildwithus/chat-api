#!/usr/bin/env bash
name_prefix="cobuild-chat-api-chatgpt-audit"
include_tests=1
include_docs=1
preset_dir="scripts/chatgpt-review-presets"
package_script="scripts/package-audit-context.sh"
COBUILD_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

preset_helper=""
for candidate in \
  "$COBUILD_REPO_ROOT/node_modules/@cobuild/repo-tools/src/review-gpt-api-presets.sh" \
  "$COBUILD_REPO_ROOT/../repo-tools/src/review-gpt-api-presets.sh"
do
  if [ -f "$candidate" ]; then
    preset_helper="$candidate"
    break
  fi
done

if [ -z "$preset_helper" ]; then
  echo "Error: missing repo-tools review preset helper. Install dependencies first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$preset_helper"
