#!/usr/bin/env bash
# beforeShellExecution hook: block `git push` if tracked files contain likely
# secrets / sensitive data. Scans tracked content (what a push would ship).
#
# Output contract (beforeShellExecution): JSON with `permission` allow|deny.
# failClosed:true in hooks.json means any crash/timeout also blocks the push.
set -euo pipefail

input="$(cat)"

# Extract the command being run (jq is guaranteed on this host; fall back to grep).
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

cd "${CURSOR_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"

findings=""

# Exclude this hook (its regexes would self-match) and the example env file.
EXCLUDES=(':!.cursor/hooks/' ':!*.example' ':!.env.example')

scan() { # <label> <extended-regex> [extra pathspec excludes...]
  local label="$1" pattern="$2" hits
  shift 2
  hits="$(git grep -nIE "$pattern" -- . "${EXCLUDES[@]}" "$@" 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    findings+=$'\n['"$label"$']\n'"$hits"$'\n'
  fi
}

# High-confidence secret signatures (low false-positive rate).
scan "Private key block"        '-----BEGIN [A-Z ]*PRIVATE KEY-----'
scan "AWS access key id"        'AKIA[0-9A-Z]{16}'
scan "AWS secret access key"    'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+]{40}'
scan "Google API key"          'AIza[0-9A-Za-z_-]{35}'
scan "Slack token"             'xox[baprs]-[0-9A-Za-z-]{10,}'
scan "Stripe live key"         '(sk|rk)_live_[0-9A-Za-z]{16,}'
scan "GitHub token"            'gh[pousr]_[0-9A-Za-z]{36,}'
scan "Google OAuth secret"     'GOCSPX-[0-9A-Za-z_-]{20,}'
scan "JWT"                     'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

# DB URL with an INLINE password. Disallow '<' so doc placeholders like
# `://user:<pw>@` don't trip it, and skip markdown docs which legitimately show
# connection-string formats.
scan "DB URL with password" \
  '(postgres|postgresql|mysql|mongodb|redis|amqp)://[^[:space:]"'"'"'/]+:[^[:space:]"'"'"'@/<]+@' \
  ':!*.md'

# A real .env (not .env.example) must never be tracked.
env_tracked="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example' || true)"
if [ -n "$env_tracked" ]; then
  findings+=$'\n[Tracked .env file]\n'"$env_tracked"$'\n'
fi

if [ -n "$findings" ]; then
  msg="Push blocked: possible secrets/sensitive data in tracked files.$findings"
  # Emit JSON safely via jq when available.
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg m "$msg" \
      '{permission:"deny", user_message:$m, agent_message:("Secrets scan failed before git push. Remove the flagged data (move it to an untracked .env), then retry.\n"+$m)}'
  else
    printf '{"permission":"deny","user_message":%s}\n' "\"secrets detected before push\""
  fi
  exit 0
fi

echo '{"permission":"allow"}'
exit 0
