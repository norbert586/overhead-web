#!/bin/bash
# Installs backend + frontend dependencies at the start of a Claude Code cloud
# session, so typecheck / lint / build / `npm run smoke` / `node scripts/e2e.mjs`
# work immediately. Synchronous on purpose: nothing races the install.
set -euo pipefail

# Cloud sessions only — local machines manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `npm install` (not `ci`) so the cached container's node_modules is reused —
# a no-op when nothing changed. better-sqlite3 ships prebuilt binaries for
# the session's Node, so no compiler is needed.
for dir in backend frontend; do
  echo "session-start: npm install in $dir"
  (cd "$dir" && npm install --no-audit --no-fund --loglevel=error)
done

echo "session-start: dependencies ready"
