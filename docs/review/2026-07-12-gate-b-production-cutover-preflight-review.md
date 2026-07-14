# Gate B Production Cutover Preflight Review

## 结论

通过：Gate B production cutover preflight 已具备可执行条件。Reviewed batch `20260712T065413Z` 的 44 个 live source files 仍与 immutable backup manifest 完全一致；sessions、memory 和 live SQLite directory 均为 `0700`；live SQLite target 不存在；端口 3001 无 listener，宿主进程检查未发现 Agent Runtime；文件系统可用 127,715,756 KiB。Backup、restore、isolated import、quarantine、owner mapping、idempotency 和 SQLite integrity evidence 均已通过前序 Review。

Production cutover wrapper 与 fixed-scope TS script 已冻结但未执行。该 preflight PASS 不等于 first-write promotion：运行 wrapper 将创建 live SQLite target，并从第一笔 SQLite write 起进入 forward-fix-only，不再允许回退到 JSON binary writes。因此本 Review 后必须单独记录最终人工 promotion，再执行命令。

## Review 范围

- [Production cutover wrapper](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/run-production-cutover.sh)
- [Production cutover script](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/run-production-cutover.ts)
- [Reviewed backup manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/20260712T065413Z/backup-manifest.json)
- [Owner mappings](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/owner-mappings.json)
- [Quarantine decision](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/quarantine-decision.json)
- [Restore report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/restore-report.json)
- [Isolated import report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/isolated-import-report.json)
- [Live history source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/sessions/)
- [Live memory source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/memory/)
- [Live SQLite directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/)
- [Backup pre-cutover review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-backup-manifest-precutover-review.md)
- [Restore rehearsal review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-isolated-restore-rehearsal-review.md)
- [Isolated import review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-isolated-import-rehearsal-review.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Pass — Source freshness and quiescence are established

Live source contains the same 44 relative paths, sizes and SHA-256 values as reviewed backup batch `20260712T065413Z`. Host process inspection found no Agent Runtime process and port 3001 has no listener. The wrapper repeats both process/port checks immediately before execution; the TS script repeats all source hashes before opening the live SQLite database.

### Pass — Cutover command is fixed-scope and fail-closed

The wrapper invokes one fixed TS script with absolute paths. The script refuses an existing live database, evidence/report overwrite, non-`0700` production directories, source drift, mapping drift, unexpected symlink, count mismatch, unsafe quarantine fields or failed SQLite integrity check. It does not read Provider credentials or call external services.

### Pass — Production acceptance oracles match rehearsed data

The live import requires exactly 38 conversations, 6,689 messages, 0 memory facts and 1 approved quarantine item. It verifies persisted SQLite counts independently and requires `PRAGMA integrity_check=ok`. The original tenant/conversation scopes remain mapped to `user-001` without tenant collapse.

### Critical boundary — First SQLite write is irreversible by binary rollback

Before database open, the script writes a start marker binding batch, backup manifest hash, source count and rollback contract. Once migration/import writes live SQLite, any failure leaves the database and evidence in place for diagnosis and forward-fix; the script never deletes or replaces them. JSON remains backup/source evidence but must not resume as write authority.

### Observation — Ongoing RPO is operational, not proven by one cutover snapshot

The reviewed source remained hash-stable from backup through preflight, so observed cutover-point source drift is zero. This does not establish a recurring backup schedule. Stage 0 operations closeout still needs an owner and frequency for ongoing production backup RPO.

## 最终建议

1. Record an explicit final promotion for wrapper execution after reading this Review. The exact command is the approved production cutover wrapper; do not invoke the TS script directly.
2. Execute once only. Any non-zero exit after the start marker is created must enter incident/forward-fix review; never rerun blindly and never delete the live database.
3. After PASS, verify live report, database counts, integrity, source non-mutation and forward-fix marker, then perform an independent Gate B post-cutover Review before changing tasks/dashboard.
4. Keep Stage 0 Gate C, Gate D, contract freeze and archive blocked after Gate B; do not start parity.

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不新增 change。
- Superpowers：production cutover execution remains a strict evidence slice followed by independent post-cutover Review.
- Exact promotion command: `/Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/run-production-cutover.sh`.
- Production first write：尚未执行；需要本 Review 后的最终人工 promotion。
- Dashboard/tasks：cutover PASS 和 post-cutover Review 前不得更新 Stage 0 状态或勾选 2.6/2.7。
- 项目规则：未修改。
