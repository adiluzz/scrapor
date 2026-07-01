#!/usr/bin/env bash
# Cursor beforeShellExecution hook: block `git push` if tracked files contain
# likely secrets. Delegates to scripts/secrets-scan.sh so the Cursor path and the
# git pre-push path enforce the exact same rules.
#
# Output contract (beforeShellExecution): JSON with `permission` allow|deny.
# failClosed:true in hooks.json means any crash/timeout also blocks the push.
set -euo pipefail

input="$(cat)"

if command -v jq >/dev/null 2>&1; then
  command_str="$(printf '%s' "$input" | jq -r '.command // empty')"
else
  command_str="$input"
fi

# Only gate real pushes (matcher already narrows, but double-check here).
if ! printf '%s' "$command_str" | grep -Eq 'git[[:space:]]+push'; then
  echo '{"permission":"allow"}'
  exit 0
fi

root="${CURSOR_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"

if out="$(bash "$root/scripts/secrets-scan.sh" 2>&1)"; then
  echo '{"permission":"allow"}'
  exit 0
fi

msg="Push blocked: possible secrets/sensitive data in tracked files.
$out"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg m "$msg" \
    '{permission:"deny", user_message:$m, agent_message:("Secrets scan failed before git push. Remove the flagged data (move it to an untracked .env), then retry.\n"+$m)}'
else
  printf '{"permission":"deny","user_message":%s}\n' "\"secrets detected before push\""
fi
exit 0
