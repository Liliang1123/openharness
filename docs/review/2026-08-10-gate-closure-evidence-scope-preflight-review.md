# Gate Closure Evidence Scope Preflight Review

## 结论

通过（条件性实施）：已批准的 [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/proposal.md) 明确了两个 dirty 测试文件的 correction-only 拆分、manifest/closure 扩展、secret-scan dependency binding 与 fresh allowlist 路线。可以进入 TDD 实施，但不得把原始两个测试文件整体纳入 scope；不得重跑或改写 v21 C31；staging/commit 仍需在新 scope 复核后再次确认。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/tasks.md)
- [OpenSpec governance delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/specs/gate-closure-evidence/spec.md)
- [v21 C31 failure review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-persistence-fix-phase-b-c31-review.md)
- [correction plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-08-07-gate-closure-persistence-fix-correction-plan.md)
- [v21 command allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-command-allowlist.md)
- [machine provenance manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- [human provenance manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- [secret scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- [mcpRegistry dirty test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts)
- [traceOutbox dirty test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts)

## 主要发现

### 高

1. Whole-file admission is not permitted. The two dirty files mix the C31-sensitive fixture with additional lifecycle, routing, concurrency, and error-path tests. The implementation must create independently reviewable correction-only artifacts and leave the original files outside the candidate.
2. The scanner has 29 unique fixture-rule paths; 16 are outside the locked v21 closure. The implementation must bind the complete declared dependency set to provenance rows or fail closed. The candidate also adds one transitive TypeScript test helper, so the relocked closure adds 17 paths and 17 rows; adding only two staging paths is insufficient.

### 中

3. The v21 clean worktree cannot run the repository full suite because the commit does not contain the main worktree's broader dirty/untracked runtime tests and Gate-D packet. This is a baseline limitation, not evidence for this change; scoped governance tests and exact verifier commands must be used until a fresh candidate closure explicitly covers any additional test dependencies.
4. The v21 C31 count is consumed. Any fresh candidate requires a new anchor, new allowlist version, new role/phase/count record, and a new independent PIR.

## 最终建议

- Implement the dedicated correction-only test artifacts first, with RED tests for manifest dependency binding and clean/dirty candidate equivalence.
- Add an explicit manifest dependency section, update closure/provenance verifiers, and make the scanner read pinned candidate content rather than unbound dirty copies.
- Generate a fresh allowlist only after the resulting exact path set and row count are mechanically known.
- Keep dashboard `partial`, OpenSpec active, and all external/credential/promotion/archive/push actions disabled.

## 后续门禁

- [ ] TDD RED/GREEN for dependency binding, candidate-source selection, and scope partition.
- [ ] Strict OpenSpec validation after any delta update.
- [ ] Fresh v22-or-later allowlist and explicit staging/commit scope confirmation.
- [ ] Fresh C23-C51 execution; do not reuse v21 C31.
- [ ] Independent post-implementation Review/PIR with distinct verifiable reviewer identity.

## 规则变更说明

未修改 [AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md) 或 [openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/AGENTS.md)。本 Review 仅批准进入实施，不代表新 scope 已 staging/commit、C31 PASS 或 PIR PASS。
