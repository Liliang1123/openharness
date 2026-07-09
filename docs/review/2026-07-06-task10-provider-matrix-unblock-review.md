# Task 10 Provider Matrix Unblock Review

## 结论

需修改。Focused tests are green, but the current evidence chain can still produce a false `local_verified` result and the shared result schema permits invalid status placement. Do not promote Task 10 or continue to real credentials.

## Review 范围

- [Task 10 unblock plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-06-task10-unblock-provider-matrix-plan.md)
- [ProviderAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderAdapter.java)
- [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [AnthropicAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [OpenAiFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- [AnthropicFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrix.java)
- [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [AnthropicFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrixTest.java)
- [shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- [qualification report tests](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/qualificationReport.test.ts)
- [OpenAI-compatible local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-openai-compatible-local.json)
- [Anthropic local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-anthropic-local.json)

## 主要发现

### Important — SSE parse failures are silently converted into success candidates

Both stream mergers catch every chunk parsing/shape exception and continue without recording failure: [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java#L155) and [AnthropicAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java#L250). A malformed, truncated, or unsupported required SSE chunk can therefore be discarded and the adapter can synthesize a normal response from partial or empty state. The current tests cover only valid happy-path SSE.

Required fix: add RED cases for malformed JSON, truncated tool arguments/content blocks, missing required terminal event, and unknown required event shape. Fail closed with a structured provider stream error; do not use broad `catch (Exception) { /* ignore */ }`.

### Important — Reports are not generated from the observed matrix execution

The matrix runners return only `id`, `result`, and a small `observed` map. They do not emit the report contract's environment fingerprint, protocol version, real request hash, oracle, measured duration, track, or generated timestamp. The two JSON reports contain manually curated hashes and durations and have no verifiable binding to the runner execution.

Required fix: make each runner produce complete shared-contract row data from the actual request and observation; compute SHA-256 from the canonical redacted request, measure duration, and write the report through one schema-validating report writer. Tests must regenerate a temporary report and compare its validated content/hash to the reviewed immutable artifact.

### Important — `local_verified` is valid in row and production-report positions

[shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts#L393) uses one enum for matrix-row results and report results. Adding `local_verified` therefore allows an individual row to use `local_verified`, and allows a `track=production` report to use `local_verified`. Neither invalid combination has a negative test.

Required fix: separate row result (`pass | fail | blocked`) from report result, and constrain report result by track. `local_verified` is valid only for `track=local`; production must use its production promotion vocabulary. Add negative tests for row-level `local_verified` and production-track `local_verified`.

### Risk — Timeout is per attempt, not a shared matrix deadline

Each retry creates a new request with the full `timeoutMs`, then adds retry backoff. A 503/slow sequence can exceed the caller's stated timeout by multiple attempts. The current timeout test covers one slow response without retry.

Required fix: define `timeoutMs` as an end-to-end wall-clock deadline or rename it to `attemptTimeoutMs`. For the approved bounded-timeout oracle, use one deadline across retries and add a slow-503 regression test.

## 正向验证

- Shared schema focused suite: 46 tests passed.
- Runtime qualification/redaction suites: 5 tests passed.
- OpenAI-compatible and Anthropic loopback matrix suites: 2 tests passed.
- The new happy-path sync, tool, usage, retry, timeout, cancellation, reasoning, and stream cases execute successfully in the local fixture.

These passing tests do not cover the evidence-binding and fail-closed gaps above.

## 最终建议

1. Keep both provider reports and Task 10 status non-promotable until all Important findings are fixed.
2. Apply TDD in this order: schema status separation; malformed/truncated SSE fail-closed; shared retry deadline; runner-to-report generation and hash binding.
3. Regenerate reports only through the validated writer, then rerun full TS/Java, OpenSpec, dashboard, whitespace, and secret scans.
4. Request a second code/evidence Review before setting Task 10 to `local_verified`.

## 后续门禁

- Active OpenSpec remains open.
- Gate B remains `pending_production_evidence`.
- Gate C remains closed; no real credentials or endpoints are authorized.
- A Superpowers TDD fix slice is required. The existing Active OpenSpec covers the behavior; no new OpenSpec change is required.
- Project rules were not modified by this Review.
