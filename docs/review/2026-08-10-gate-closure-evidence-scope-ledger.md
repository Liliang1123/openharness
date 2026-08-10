# Gate Closure Evidence Scope Ledger

## 结论

通过（correction-only partition）：两个原始 dirty test 文件均被按 test block 拆分；仅将 C31 correction-owned security/persistence assertions复制为独立 artifacts。原始 mixed files、其余 lifecycle/routing/concurrency/validation blocks 与未审查 dirty 内容不进入本 correction candidate。

## Review 范围

- [原始 mcpRegistry test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts)
- [原始 traceOutbox test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts)
- [mcpRegistry correction-only artifact](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts)
- [traceOutbox correction-only artifact](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts)
- [locked machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- [candidate-bound secret scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- [scope implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-08-10-gate-closure-evidence-scope-implementation-plan.md)

## Partition ledger

### mcpRegistry.test.ts

| Origin block | Classification | Candidate treatment | Reason |
| --- | --- | --- | --- |
| `loadMcpConfig` block, lines 61–68 | unrelated config validation | excluded | Tests rejection of an unsafe default config shape; it is not the C31 environment-redaction fixture. |
| `loadMcpConfig` block, lines 70–96 | unrelated Gate-D config validation | excluded | Tests absolute-path, shape, timeout, and server-name validation; no correction-owned secret-scan contract. |
| `loadMcpConfig` block, lines 98–120 | correction-only environment redaction | copied to [mcpRegistry.correction.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts) | This is the sole C31-sensitive fixture: safe host variables and explicit server env are asserted without forwarding protected host variables. Its scanner ownership is two redacted sensitive categories, each count `1`. |
| imports added at lines 1–10 | dependency subset | reduced | The artifact imports only `buildMcpChildEnvironment`; filesystem/temp/config/client imports belong to excluded blocks. |
| `fakeClient` helper and `McpRegistry — lazy lifecycle and virtual skills` block, lines 123–456 | unrelated lifecycle/routing/concurrency/error handling | excluded | These blocks exercise client startup, virtual skills, broker routing, idle reaping, discovery failures, and shutdown; they are functional tests outside the C31 correction fixture. |
| original `loadMcpConfig` baseline blocks, lines 14–59 | pre-existing baseline | unchanged and excluded | They are not part of the correction-only artifact and remain in the original file. |

### traceOutbox.test.ts

| Origin block | Classification | Candidate treatment | Reason |
| --- | --- | --- | --- |
| `RecordingTraceClient` additions at lines 13–51 | shared helper expansion | reduced/localized | The correction artifact keeps only a local client that records the committed trace and checks the forwarded identity header; concurrency/failure bookkeeping is excluded. |
| `Worker-claimed candidates concurrently` block, lines 54–105 | unrelated batch/concurrency behavior | excluded | It verifies bounded parallelism and store-level semantic outcome batching, not the correction-only durable header/redaction path. |
| `retries a committed trace event after crash before local acknowledgement`, lines 107–145 | correction-only durable identity/redaction path | copied in reduced form to [traceOutbox.correction.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts) | This is the correction-owned behavior: committed trace identity headers survive retry, the persisted trace event contains no authorization value, and the outbox reaches delivered state. The reduced artifact has two bearer occurrences and one sensitive authorization assignment; the scanner rule is bound to that exact artifact. |
| `persists retry state for Java outage` and `moves exhausted delivery to durable dead letter`, lines 147–191 | unrelated retry/dead-letter behavior | excluded | These are broader outage/readiness state transitions and remain outside the correction-only fixture. |
| `uses bounded concurrency` and `rejects one failed transition transaction`, lines 193–266 | unrelated concurrency/transaction behavior | excluded | These exercise parallel delivery and transaction failure recovery; they are not needed to establish the C31 persistence/header correction. |
| `traceHeaders`, `seededTraceOutbox`, and `countTransactions` helpers, lines 269–348 | shared fixture/dependency | reduced/localized | The correction artifact has a local minimal seed and header helper; no helper is imported from the mixed original. |
| original durable outbox baseline blocks outside the listed additions | pre-existing baseline | unchanged and excluded | They remain in the original file and are not closure entrypoints. |

## Candidate artifact dependency binding

The two artifacts are independently reviewable entrypoints. Their direct local dependencies are represented by the TypeScript closure and rows in the machine manifest:

- [mcpRegistry.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/mcpRegistry.ts) is the production dependency of the MCP correction artifact.
- [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/traceOutbox.ts), [sqliteRuntimeRepositories.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/sqliteRuntimeRepositories.ts), [sqliteRepositoryTestUtils.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/sqliteRepositoryTestUtils.ts), [javaClient.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/javaClient.ts), and [types.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/types.ts) are direct or type-only dependencies of the trace correction artifact.
- The scanner has exactly `29` unique fixture-rule paths. The manifest declares the same exact set as `secretScanDependencies`; every dependency is a locked closure path with exactly one provenance row. The [scope diagnostic](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-diagnostic.mjs) and governance test enforce the bidirectional equality without printing literals.
- The resulting candidate lock is `17` entrypoints, `102` closure paths, and `107` rows. The two original mixed files are neither entrypoints nor scanner fixture-rule keys.

## Exclusions and safety

- No whole-file admission of either original test.
- No staging of unrelated dirty/untracked tests, source, docs, dashboard artifacts, or binaries.
- No credential read, provider/MCP/browser call, promotion, archive, or push.
- This ledger does not claim C31 pass or independent PIR; those require the fresh v22 sequence and a distinct reviewer identity.

## 后续门禁

- [ ] Fresh v22 scope confirmation before main-worktree staging/commit.
- [ ] C23–C51 only under the new allowlist; v21 C31 remains consumed.
- [ ] Independent post-implementation review/PIR only after the fresh sequence and explicit handling of the known clean full-suite baseline limitation.
