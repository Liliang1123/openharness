# Gate B Production Cutover Post Review

## 结论

需修改：Gate B production cutover command 本身退出 0，live SQLite 已导入 38 conversations、6,689 messages、0 memory facts，1 个 approved quarantine，persisted counts 匹配，`PRAGMA integrity_check=ok`，source 仍与 reviewed backup 一致，cutover state 为 `forward_fix_only` 且 `legacyWritesAllowed=false`。Focused migration/import/crash tests 19/19 PASS，Runtime typecheck PASS。

但 independent post-cutover probe 发现 live SQLite file mode 为 `0644`，不满足 production data owner-only permission target。父目录为 `0700`，当前同机其他用户不能遍历到文件，降低了即时暴露风险；仍必须用 forward-fix 将数据库收紧为 `0600`，并为后续 SQLite sidecar/runtime process 设置 `umask 077`。修正和复核前 Gate B 不得 PASS，不得勾选 Stage 0 task 2.6/2.7，不得更新 dashboard。

## Review 范围

- [Live SQLite database](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)
- [Production cutover report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-cutover-report.json)
- [Production cutover state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-cutover-state.json)
- [Production cutover start marker](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-cutover-start.json)
- [Production quarantine manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-quarantine-manifest.json)
- [Production cutover wrapper](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/run-production-cutover.sh)
- [Production cutover script](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/run-production-cutover.ts)
- [Reviewed backup manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/20260712T065413Z/backup-manifest.json)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Production cutover preflight review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-production-cutover-preflight-review.md)

## 主要发现

### High — Live SQLite file is 0644

Independent probe observed the live database as mode `0644`, size 1,490,944 bytes. Root cause is the cutover wrapper inheriting the host shell's permissive default umask while SQLite created the file. The preflight verified directory modes but did not assert the newly created file mode after database open.

The containing SQLite directory remains `0700`, so non-owner users cannot currently traverse to the database despite its file bits. This is defense from the parent directory, not a reason to accept the file mode. Production persistence must remain owner-only and future WAL/SHM files must inherit the same restriction.

### Pass — Data and persistence oracles match

Independent read-only SQL counts are 38 conversations, 6,689 messages and 0 memory facts, matching both import report and approved source inventory. SQLite integrity is `ok`; source still matches all 44 reviewed backup paths/sizes/hashes.

### Pass — Forward-fix boundary is active

Production report and cutover state both record `forward_fix_only`; `legacyWritesAllowed=false` and `automaticCutoverAllowed=true`. The correct response is permission hardening in place, not database deletion, JSON rollback or cutover rerun.

### Pass — Focused deterministic verification remains green

`jsonImporter`, `runtimeStorage` and `crashMatrix` suites passed 3 files / 19 tests. Runtime TypeScript typecheck passed. No test or assertion was relaxed after cutover.

## 最终建议

1. Create a one-shot forward-fix script bound to this database path and batch. It must require parent mode `0700`, database existence, current owner, expected database hash/size or integrity precheck, then `chmod 0600` without modifying database bytes.
2. Record before/after mode, owner, unchanged SHA-256, unchanged counts and `PRAGMA integrity_check=ok` in a new immutable evidence report.
3. Record `umask 077` as mandatory for subsequent Runtime startup so SQLite WAL/SHM and other production artifacts are owner-only. Do not edit or rerun the already-executed cutover script.
4. Re-run independent post-cutover Review after the permission forward-fix. Only a PASS may advance Gate B reconciliation.

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；本 finding 是已批准 production persistence security contract 的 forward-fix，不新增 change。
- Superpowers：同一 strict Gate B slice进入 fix → verify → Review loop。
- Rollback：禁止删除 live SQLite、恢复 JSON writes 或重跑 cutover；仅允许 in-place forward-fix。
- Dashboard/tasks：保持不变，2.6/2.7 不得勾选。
- 人工审批：用户的持续授权覆盖推荐的同范围 forward-fix，但按协作约束在执行前再次报告本发现并等待确认。
- 项目规则：未修改。
