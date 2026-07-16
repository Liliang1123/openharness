#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

expect_no_matches() {
  local name="$1"
  shift
  local output
  local status
  if output="$("$@" 2>&1)"; then
    echo "$name=fail" >&2
    echo "$output" >&2
    return 1
  else
    status=$?
  fi
  if [[ "$status" -ne 1 ]]; then
    echo "$name=error:$status" >&2
    echo "$output" >&2
    return "$status"
  fi
  echo "$name=pass:no-match"
}

expect_no_matches secret_shape \
  rg -n --hidden --glob '!**/target/**' --glob '!**/node_modules/**' \
  --glob '!**/src/test/**' --glob '!**/*.test.ts' \
  '(sk-[A-Za-z0-9_-]{20,}|Bearer[[:space:]]+[A-Za-z0-9._~+/-]{20,}|api[_-]?key[[:space:]]*[:=][[:space:]]*[A-Za-z0-9._~+/-]{20,})' \
  agent-runtime/src backend/src/main docs/verification/agent-runtime-v1/providers

expect_no_matches qualification_canary_production \
  rg -n --hidden --glob '!**/target/**' --glob '!**/node_modules/**' \
  'sk-qualification-canary|Bearer qualification-canary' \
  agent-runtime/src backend/src/main docs/verification/agent-runtime-v1/providers

canary_tests="$(rg -n --hidden --glob '!**/target/**' --glob '!**/node_modules/**' \
  'sk-qualification-canary|Bearer qualification-canary' backend/src/test)"
if [[ -z "$canary_tests" ]] || grep -Evq '^backend/src/test/java/org/openharness/backend/qualification/(RealProviderQualificationConfigTest|RealProviderQualificationRunnerTest|QualificationReportWriterTest)\.java:' <<<"$canary_tests"; then
  echo "qualification_canary_test_scope=fail" >&2
  echo "$canary_tests" >&2
  exit 1
fi
echo "qualification_canary_test_scope=pass"

expect_no_matches default_identity \
  rg -n --hidden --glob '!**/node_modules/**' --glob '!**/target/**' \
  --glob '!**/*.test.ts' --glob '!**/src/test/**' \
  '(default-tenant|default-user)' agent-runtime/src backend/src/main packages/shared-schema/src

expect_no_matches bare_conversation_key \
  rg -n 'WHERE[[:space:]]+conversation_id[[:space:]]*=|PRIMARY KEY\(conversation_id\)' \
  agent-runtime/src/storage

expect_no_matches preview_durability \
  rg -n 'preview_delta|previewSeq' agent-runtime/src/storage

expect_no_matches outbox_pruning \
  rg -n '(pending|retry|dead_letter).*(delete|prune)|(delete|prune).*(pending|retry|dead_letter)' \
  agent-runtime/src/storage backend/src/main

node <<'NODE'
const fs = require("node:fs");
const entry = fs.readFileSync("agent-runtime/src/productionEntrypoint.ts", "utf8");
const server = fs.readFileSync("agent-runtime/src/server.ts", "utf8");
const checks = [
  entry.includes("createProductionServer"),
  entry.includes("AGENT_RUNTIME_SQLITE_PATH"),
  server.includes("openProductionRuntimeContext"),
  server.includes("options.runtimeContext?.history ?? options.historyStore ?? developmentStores.history()")
];
if (!checks.every(Boolean)) {
  console.error("production_sqlite_context=fail");
  process.exit(1);
}
console.log("production_sqlite_context=pass");
NODE

node <<'NODE'
const fs = require("node:fs");
const runner = fs.readFileSync("agent-runtime/src/baseline/formalSoakRunner.ts", "utf8");
const workload = fs.readFileSync("agent-runtime/src/baseline/localBaseline.ts", "utf8");
const checks = [
  runner.includes("const FIXED_DURATION_MS = 24 * HOUR_MS;"),
  runner.includes("const FIXED_SAMPLE_INTERVAL_MS = 30_000;"),
  runner.includes("const FIXED_RESTART_AT_MS = [2 * HOUR_MS, 12 * HOUR_MS, 22 * HOUR_MS];"),
  runner.includes("const FIXED_SEEDED_CONVERSATIONS = 10_000;"),
  runner.includes("const FIXED_CONCURRENCY = 20;"),
  workload.includes("noTool: 0.6,"),
  workload.includes("javaSandbox: 0.2,"),
  workload.includes("mcp: 0.15,"),
  workload.includes("approvalInterruption: 0.05")
];
if (!checks.every(Boolean)) {
  console.error("fixed_gate_d_constraints=fail");
  process.exit(1);
}
console.log("fixed_gate_d_constraints=pass");
NODE

echo "task14_negative_scans=pass"
