# Task 10 Provider Matrix Third Code & Evidence Review

## 结论

需修改。JUnit hermeticity, fail-closed canonical hashing, and no-overwrite exit behavior are verified. The explicit promotion path still contains a false-positive Anthropic retry oracle, unaudited overwrite semantics, and an unbounded production-global request-hash tracker. Task 10 cannot yet be closed as reviewed `local_verified`.

## Review 范围

- [Second Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-06-task10-provider-matrix-second-review.md)
- [OutboundRequestTracker.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OutboundRequestTracker.java)
- [QualificationReportPromoter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/QualificationReportPromoter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [OpenAI matrix runner](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- [Anthropic matrix runner](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrix.java)
- [OpenAI matrix test](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [Anthropic matrix test](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrixTest.java)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- [OpenAI report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-openai-compatible-local.json)
- [Anthropic report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-anthropic-local.json)

## 主要发现

### Important — Promoter does not exercise Anthropic 503 retry

The Promoter uses one `AtomicInteger retryAttempts` for both Provider endpoints. OpenAI consumes the `0` and `1` states first. When Anthropic later evaluates `retryAttempts.getAndIncrement() == 0`, the condition is false, so its retry route returns success immediately. The Anthropic matrix can still report the retry row as PASS because its row logic records an expected attempt count rather than an attempt count observed from the Promoter server.

Required fix: maintain independent per-provider/per-case counters and pass observed attempt counts into each row. Add a Promoter integration test that generates both reports in one process and asserts exactly two requests reached each retry endpoint.

### Important — `--overwrite` bypasses evidence audit

No-overwrite behavior is correct and independently returned exit code 2. However, `--overwrite` directly replaces the old report without recording the old report hash, new report hash, approval identity/reason, or an atomic backup/rename trail. This does not satisfy the explicit replacement workflow required by the second Review.

Required fix: replace bare `--overwrite` with an explicit promotion contract requiring an approval reason and expected old SHA-256. Write to a temporary file, validate it, compute the new SHA-256, atomically move it, and append an audit record containing old/new hashes and reason. Reject a mismatched expected old hash.

### Important — Production-global request hash tracker is unbounded

Both production adapters store every request hash in a static `ConcurrentHashMap`. The adapters remove only their active-thread entries, not tracker entries. Matrix code reads hashes using non-consuming `getRequestHash`; only matrix startup calls `clearAll`. A long-running Backend therefore accumulates request IDs/hashes indefinitely, and a reused request ID can overwrite evidence for another in-flight or completed call.

Required fix: do not install qualification evidence storage as an unconditional production-global side channel. Prefer an injected request observer/no-op observer boundary. At minimum use atomic `putIfAbsent` plus `consumeRequestHash` removal in a `finally`-safe matrix path, bounded lifetime, and collision tests. Verify ordinary production calls leave no retained tracker entries.

### Risk — Promoter writes before shared-contract validation

The Promoter serializes Java maps directly into the evidence location. Shared Zod validation happens later in TypeScript tests, after the artifact has already been replaced.

Required fix: validate the complete temporary report against an equivalent Java contract or invoke the authoritative shared-schema validator before atomic promotion. Invalid output must never replace the prior evidence.

## 已确认修复

- Row/report result schemas and track constraints are correct with negative tests.
- SSE malformed/truncated streams fail closed.
- One wall-clock deadline is shared across retry attempts.
- Canonical hashing includes URL, redacted ordered headers, and recursively key-sorted JSON body; failures throw instead of returning a zero hash.
- Focused Provider tests are hermetic: report SHA-256 values remained unchanged before and after the test run.
- Promoter without replacement authorization exits with code 2 when evidence already exists.

Observed stable report hashes during this Review:

- OpenAI: `7cfc2b94e1e28caf510ac1acc841e9343b35e25d1fc9aab81415d253c8cecbcf`
- Anthropic: `ea1c7c1b693259e5f8ac76b82ce285a4e2329b454b2472277f76bc615d983916`

## 最终建议

1. Fix Promoter retry observation and add one end-to-end Promoter integration test.
2. Replace unaudited overwrite with expected-old-hash plus reason, validation, atomic replacement, and audit record.
3. Remove or bound the production-global tracker through an injected observer/consume lifecycle.
4. Regenerate reports once, verify stable hashes, run full TS/Java/OpenSpec/dashboard/secret gates, then request a fourth and final evidence Review.

## 后续门禁

- Task 10 remains not accepted as reviewed `local_verified`.
- Active OpenSpec remains open.
- Gate B remains `pending_production_evidence`.
- Gate C remains closed; no real credentials or endpoints are authorized.
- The existing OpenSpec covers these corrections; no new proposal is required.
- Project rules were not modified by this Review.
