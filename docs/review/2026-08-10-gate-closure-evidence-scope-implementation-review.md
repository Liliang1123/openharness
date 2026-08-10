# Gate Closure Evidence Scope Implementation Review

## 结论

需修改：correction-only 拆分、manifest/closure relock、candidate-bound secret scan 与 dependency contract 已通过隔离候选验证；但当前 clean candidate 仍继承 v21 的 full-suite baseline 缺口，v22 C39/C48 不能在未明确 baseline treatment 前作为可执行通过门禁。主 worktree 暂停 staging/commit 与 C23-C51。

## Review 范围

- [scope preflight Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-preflight-review.md)
- [scope ledger](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-ledger.md)
- [scope implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-08-10-gate-closure-evidence-scope-implementation-plan.md)
- [v22 allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-persistence-fix-command-allowlist-v22.md)
- [correction-only MCP test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts)
- [correction-only trace test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts)
- [machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- [human manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- [candidate-bound scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- [scanner library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)
- [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- [governance regression](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)
- [v21 C31 review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-persistence-fix-phase-b-c31-review.md)

Independent read-only reviewer session: `019fea6e-8fee-7760-83b1-319f1748c8bf`. This was an implementation review, not the post-execution PIR.

## 主要发现

### 高

1. **Clean full-suite baseline remains unresolved.** The v21 clean candidate was observed to fail the Runtime/root full suites because broader dirty/untracked tests and a Gate-D packet are absent from the v21 commit. The new correction candidate intentionally does not admit those unreviewed files. Consequently, v22 C39 and C48 cannot be declared expected-pass gates without either a new, separately reviewed dependency expansion or an explicit baseline-exception decision. No C23-C51 execution has started.

### 已修复的重要发现

2. **Correction scope was previously under-documented.** The [scope ledger](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-ledger.md) now maps the included MCP environment-redaction block and trace durable-header/retry block, lists excluded lifecycle/config/concurrency blocks, and records direct dependency ownership. The original mixed files remain excluded.

3. **Dirty/pinned source regression was previously weak.** The governance test now injects a different dirty reader and proves source-pinned resolution bypasses it; it separately exercises declared current-required resolution and missing-current rejection.

4. **Dependency exactness was previously one-sided.** The scanner rule source is now duplicate-key checked; dependency validation requires bidirectional exact equality, one provenance row per dependency, and rejects duplicate rows, extra dependencies, and missing fixture rules.

## 隔离候选验证记录

- correction-only Vitest: 2 files, 2 tests passed.
- governance regression: 10 tests passed.
- closure verifier: `closure_ok entries=17 paths=102`.
- provenance verifier: `provenance_ok rows=107 closure=locked`.
- secret scanner: `secret_scan_ok`.
- author-preflight scope diagnostic: one final invocation, exit `0`; counts `17/102/107/29/29`.
- v21 C31 was not rerun or relabeled.

## 最终建议

1. Keep the current candidate isolated and do not stage the main worktree until the user explicitly selects the C39/C48 treatment.
2. If the user does not authorize a broader, separately reviewed clean-suite dependency closure, retain C39/C48 as `BLOCKED_BASELINE` observations and do not claim a completed C23-C51/PIR.
3. If the user authorizes the baseline exception, issue a final allowlist review confirmation before C22/C23; the sequence still must not perform credentials, external calls, promotion, archive, or push.

## 后续门禁

- OpenSpec proposal/design/tasks/spec delta remains active; no archive is permitted.
- Dashboard product entry remains `partial`; only the proposed governance entry is added at the governed sync point.
- Main worktree staging/commit requires fresh exact-scope confirmation and explicit treatment of C39/C48.
- Independent PIR is required only after the fresh sequence; this document is not a PIR.
- Project rules were not modified.
