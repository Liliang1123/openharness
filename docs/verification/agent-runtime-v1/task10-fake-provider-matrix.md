# Task 10 Fake Provider Matrix Evidence

Date: 2026-07-08

Status: `local_verified`. The deterministic local matrix infrastructure, sync/tool/usage/retry/error, and required stream, timeout, cancellation, and reasoning rows pass for both adapters. This evidence remains local-only and does not authorize real Provider credentials, production cutover, or production promotion.

## Reports

- [OpenAI-compatible local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-openai-compatible-local.json)
- [Anthropic local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-anthropic-local.json)

Both reports parse through the shared qualification schema, use `track=local`, retain ordinary usage counters, contain no fake credential, and are overall `local_verified`.

Current immutable report SHA-256 values:

- OpenAI-compatible: `7cfc2b94e1e28caf510ac1acc841e9343b35e25d1fc9aab81415d253c8cecbcf`
- Anthropic: `ea1c7c1b693259e5f8ac76b82ce285a4e2329b454b2472277f76bc615d983916`

## TDD And Observed Results

- Runtime report builder RED failed because the module was absent; GREEN passed 3 report tests plus 2 redaction tests and typecheck.
- OpenAI matrix observed PASS for sync, structured tool call, exact usage, one-503 retry recovery, terminal 400 handling, stream chunk aggregation, 100ms timeout boundary, thread interruption cancellation, and reasoning content block preservation.
- Anthropic matrix observed PASS for sync, structured tool use, exact/cache usage, one-503 retry recovery, terminal 400 handling, stream chunk aggregation, 100ms timeout boundary, thread interruption cancellation, and reasoning (thinking) block preservation.
- Promoter integration now exercises both Provider matrices in the same process and asserts exactly two hits for each retry endpoint: `openai:matrix-retry=2` and `anthropic:matrix-retry=2`.
- Evidence overwrite is blocked unless `--overwrite`, `--expected-old-sha=<filename>=<sha256>`, and `--reason` are supplied; overwrite writes temp output, validates it, atomically promotes it, and appends an audit JSONL record with old/new hashes.
- Outbound request hash capture is qualification-scoped: normal production calls outside capture retain no global hashes, matrix rows consume hashes, and request-id hash collisions fail closed.
- Promoter validates the Java report contract before any replacement, including row/report track consistency, local-vs-production result rules, SHA-256 request hash shape, row result enum, and required-row veto.

## Verification

- RED observation: `mvn -f backend/pom.xml -Dtest=QualificationReportPromoterTest,OutboundRequestTrackerTest test` failed at compile time because `PromoterRunResult`, `generateReportsWithLoopbackServer`, `PromotionOptions`, `PromotionResult`, `beginCapture`, `consumeRequestHash`, and `retainedRequestHashCount` were absent.
- Focused GREEN: `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,QualificationReportPromoterTest,OutboundRequestTrackerTest test` passed: 12 tests, 0 failures.
- Backend full suite: `mvn -f backend/pom.xml test` passed: 42 tests, 0 failures.
- Shared schema: `/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test` passed: 47 tests.
- Runtime: `/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test` passed: 58 files, 292 tests. Expected malformed MCP fixture stderr remained test-owned.
- Frontend: `/opt/homebrew/bin/pnpm --filter @openharness/frontend test` passed: 6 files, 24 tests.
- Integration: `/opt/homebrew/bin/pnpm --filter @openharness/integration-tests test` passed: 5 files, 17 tests.
- Typecheck: `/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck`, `/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck`, and `/opt/homebrew/bin/pnpm --filter @openharness/frontend typecheck` all passed.
- OpenSpec: `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` passed. PostHog DNS flush warnings were non-blocking after validation success.
- Dashboard: `/opt/homebrew/bin/pnpm dashboard:check` passed and reported generated outputs current.
- Whitespace: `git diff --check` passed.
- Promoter no-overwrite guard: `mvn -f backend/pom.xml compile exec:java -Dexec.mainClass=org.openharness.backend.qualification.QualificationReportPromoter` exited 2 because existing immutable evidence requires explicit overwrite inputs.
- Hermeticity: report SHA-256 values stayed unchanged after focused/full Java and TS verification; no `qualification-report-promotion-audit.jsonl` was created during no-overwrite guard.

## Next Slice

Task 10 is locally ready for final human Review. Real credentials remain behind Gate C. Gate B remains `pending_production_evidence`; this local evidence cannot close production migration/cutover gates.
