#!/usr/bin/env bash
# Shared secrets scanner — single source of truth for push protection.
#
# Exit 0 = clean, exit 1 = findings (printed to stderr).
#
# Used by BOTH:
#   - the git pre-push hook (.githooks/pre-push), and
#   - the Cursor beforeShellExecution hook (.cursor/hooks/scan-secrets-before-push.sh)
# so enforcement is identical no matter who/what pushes ("zero trust": no push
# path bypasses the scan). Scans tracked content — i.e. exactly what a push ships.
set -euo pipefail

cd "${CURSOR_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"

findings=""

# Exclude the scanners themselves (their regexes would self-match) and examples.
EXCLUDES=(':!.cursor/hooks/' ':!.githooks/' ':!scripts/secrets-scan.sh' ':!*.example' ':!.env.example')

scan() { # <label> <extended-regex> [extra pathspec excludes...]
  local label="$1" pattern="$2" hits
  shift 2
  hits="$(git grep -nIE "$pattern" -- . "${EXCLUDES[@]}" "$@" 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    findings+=$'\n['"$label"']\n'"$hits"$'\n'
  fi
}

# High-confidence secret signatures (low false-positive rate).
scan "Private key block"     '-----BEGIN [A-Z ]*PRIVATE KEY-----'
scan "AWS access key id"     'AKIA[0-9A-Z]{16}'
scan "AWS secret access key" 'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+]{40}'
scan "Google API key"       'AIza[0-9A-Za-z_-]{35}'
scan "Slack token"          'xox[baprs]-[0-9A-Za-z-]{10,}'
scan "Stripe live key"      '(sk|rk)_live_[0-9A-Za-z]{16,}'
scan "GitHub token"         'gh[pousr]_[0-9A-Za-z]{36,}'
scan "Google OAuth secret"  'GOCSPX-[0-9A-Za-z_-]{20,}'
scan "JWT"                  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

# DB URL with an INLINE password. Excludes '<' and shell interpolation chars
# ('$', '{', '}') so placeholders/templates like `://user:<pw>@` or
# `://${USER}:${PW}@` don't trip it, and skips markdown docs which legitimately
# show connection-string formats.
scan "DB URL with password" \
  '(postgres|postgresql|mysql|mongodb|redis|amqp)://[^[:space:]"'\''"'\''/${}]+:[^[:space:]"'\''"'\''@/<${}]+@' \
  ':!*.md'

# A real .env (not .env.example) must never be tracked.
env_tracked="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example' || true)"
if [ -n "$env_tracked" ]; then
  findings+=$'\n[Tracked .env file]\n'"$env_tracked"$'\n'
fi

if [ -n "$findings" ]; then
  printf 'Possible secrets/sensitive data in tracked files:%s\n' "$findings" >&2
  exit 1
fi
exit 0
