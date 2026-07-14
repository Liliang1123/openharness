#!/bin/sh
set -eu
umask 077
: "${AGENT_RUNTIME_SQLITE_PATH:?AGENT_RUNTIME_SQLITE_PATH is required}"
: "${OPENHARNESS_SERVICE_TOKEN:?OPENHARNESS_SERVICE_TOKEN is required}"
export AGENT_RUNTIME_PROFILE=production
exec pnpm --filter @openharness/agent-runtime exec node --import tsx src/index.ts
