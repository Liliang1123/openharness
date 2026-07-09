# Task 10 Provider Matrix Second Code & Evidence Review

## 结论

需修改。Schema status separation, fail-closed SSE parsing, and shared retry deadlines are fixed. The report evidence pipeline still mutates checked-in artifacts during ordinary tests and does not hash the actual canonical outbound Provider request, so Task 10 cannot yet be accepted as `local_verified`.

## Review 范围

- [Previous Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-06-task10-provider-matrix-unblock-review.md)
- [Task 10 fix plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-06-task10-unblock-provider-matrix-plan.md)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/test/schema.test.ts)
- [Runtime report tests](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/qualificationReport.test.ts)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [OpenAI matrix runner](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- [Anthropic matrix runner](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrix.java)
- [Java redactor](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/QualificationRedactor.java)
- [OpenAI matrix test](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [Anthropic matrix test](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrixTest.java)
- [OpenAI local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-openai-compatible-local.json)
- [Anthropic local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-anthropic-local.json)

## 主要发现

### Important — Ordinary tests overwrite checked-in “immutable” evidence

Both JUnit matrix tests locate files under the repository and overwrite them with new timestamps and measured durations. Independent checksum evidence:

- Before focused tests: OpenAI `e66fd11abcc7be7f470d2f44f8c94a630343c807`; Anthropic `6357fd808df1ae8bfd5cbee8e1764f6b845eb739`.
- After the same focused tests: OpenAI `174201d3ea9e63c77d4ee5b2f8fcc4fb75cd43c4`; Anthropic `7df0fb2f8804a00a1523869d47bbc0e2b85dbd27`.

This makes normal regression tests stateful, continuously dirties the worktree, and contradicts the claim that reviewed reports are immutable. Test success can also depend on repository layout through `findReportFile`.

Required fix: tests write only to a temporary directory and validate generated reports there. A separate explicit qualification CLI command may promote one validated temporary report into the immutable evidence directory. The promotion command must fail if the destination already exists unless an explicit replacement workflow records the old/new hashes and approval.

### Important — `requestHash` is not bound to the actual outbound HTTP request

The runner hashes the internal `ModelChatRequest` record, not the provider-specific serialized body and security-redacted headers actually sent by the adapter. The Java redactor handles strings, maps, and lists only; a Java record is returned unchanged. The adapter's model alias resolution, Provider-specific message/tool conversion, stream flag, endpoint, protocol headers, and canonical serialized body therefore are not represented by the hash.

The hash helper also returns 64 zeroes on any serialization or digest error, allowing evidence generation to continue with a fake valid-looking hash.

Required fix: expose or capture one canonical outbound request representation immediately before `HttpRequest` construction, redact its headers, canonicalize its JSON body deterministically, and hash that representation. Hash/canonicalization failure must fail the row and report; never substitute a zero hash. Add tests proving that a provider-body/header change changes the hash while map ordering alone does not.

## 已确认修复

- Row results and report results use separate schemas.
- `local_verified` is rejected for rows and production-track reports; local-track `pass` is rejected.
- OpenAI stream requires `[DONE]`; Anthropic stream requires `message_stop`.
- Malformed stream JSON now fails closed.
- Retry timeout uses one wall-clock deadline and has slow-503 coverage.
- Focused shared-schema, Runtime report/redaction, and both loopback Provider matrix tests pass.

## 最终建议

1. Move artifact writing out of JUnit into an explicit qualification/promotion command.
2. Bind report rows to canonical outbound HTTP requests, with fail-closed hashing.
3. Add hermeticity verification: run the full test suite and assert the two evidence-file checksums and Git status are unchanged.
4. Regenerate the reports once through the explicit command, record report hashes, rerun schema/secret checks, and request a third evidence Review.

## 后续门禁

- Task 10 remains not accepted as `local_verified` despite the current report label.
- Active OpenSpec remains open.
- Gate B remains `pending_production_evidence`.
- Gate C remains closed; no real credentials/endpoints are authorized.
- The existing OpenSpec covers this correction; no new OpenSpec proposal is required.
- Project rules were not modified by this Review.
