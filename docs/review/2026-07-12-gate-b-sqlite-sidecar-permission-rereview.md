# Gate B SQLite Sidecar Permission Re-Review

## 结论

通过：SQLite sidecar permission forward-fix 已完成。Main database、SHM 和 WAL 均为 owner-only `0600`，parent directory 为 `0700`；forward-fix 前后所有 artifact bytes/hash/size 不变。独立复核在 `LC_ALL=C`、`umask 077` 和 Runtime/port quiesced 条件下重新打开 live database，三个 artifacts 仍保持 `0600`，counts 为 38 conversations、6,689 messages、0 memory facts，`PRAGMA integrity_check=ok`，rollback mode 保持 `forward_fix_only`。

该 PASS 关闭 production SQLite file/sidecar permission finding，但不单独关闭 Gate B。Gate B 总证据仍需最终 reconciliation，之后才能决定 Stage 0 task 2.6/2.7 状态。

## Review 范围

- [Live SQLite main database](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)
- [Live SQLite SHM](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite-shm)
- [Live SQLite WAL](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite-wal)
- [Sidecar permission forward-fix report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-sidecar-permission-forward-fix-report.json)
- [Main database permission report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-permission-forward-fix-report.json)
- [Production cutover report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-cutover-report.json)
- [Sidecar permission review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-sqlite-sidecar-permission-review.md)
- [Production cutover post review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-production-cutover-post-review.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Pass — All SQLite artifacts are owner-only

Observed modes after correction and again after independent readonly open under `umask 077`:

| Artifact | Mode |
| --- | --- |
| Main database | `0600` |
| SHM | `0600` |
| WAL | `0600` |

Parent directory remains `0700`; all artifacts remain owned by the current operator.

### Pass — Permission correction did not modify database bytes

The sidecar correction changed mode bits only. Main/SHM/WAL SHA-256 and sizes were identical before and after chmod. Database counts and integrity remained unchanged.

### Pass — Independent probe uses the production-safe process boundary

The final probe fixed locale to `LC_ALL=C`, confirmed no port 3001 listener and no executable `node` process running an Agent Runtime entrypoint, set `umask 077`, then opened SQLite readonly. No locale warning or self-matching process false positive remained.

### Resolved — Earlier quiescence guard self-match

The first sidecar correction attempt stopped before chmod because an overbroad process pattern matched the current heredoc shell command. A read-only follow-up found no actual Runtime. The guard was narrowed to executable `node` plus Runtime entrypoint args; the correction then executed under the intended quiescence condition.

## 最终建议

1. Treat `umask 077` as mandatory for every production Runtime or verification process that may open live SQLite; file chmod alone is insufficient for future sidecar creation.
2. Reconcile the full Gate B evidence chain: immutable backup, source stability, owner mapping, quarantine decision, restore RTO, isolated import, production import, forward-fix state, permission correction, focused deterministic tests and independent reviews.
3. Only after Gate B total Review PASS update Stage 0 tasks; keep Gate C, Gate D, contract freeze, Stage 0 archive and parity blocked.

## 后续门禁

- OpenSpec：continue active `harden-agent-runtime-single-node-production`; no new change required.
- Superpowers：next action is strict Gate B total evidence reconciliation.
- Runtime start：BLOCKED until the startup command explicitly establishes `umask 077` and uses the live SQLite configuration.
- Dashboard/tasks：unchanged in this correction slice.
- 项目规则：未修改。
