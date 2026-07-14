# Gate B SQLite Sidecar Permission Review

## 结论

需修改：live SQLite main database permission forward-fix 已将 mode 从 `0644` 收紧到 `0600`，且 SHA-256、size、38 conversations、6,689 messages、0 memory facts 与 `integrity_check=ok` 全部保持不变。但独立复核打开 WAL database 后，SQLite directory 中的 SHM sidecar 为 `0644`；main database 与 WAL 为 `0600`。因此 production persistence owner-only permission 尚未对全部 SQLite artifacts 成立，Gate B 继续 BLOCKED。

## Review 范围

- [Live SQLite main database](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)
- [Live SQLite SHM](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite-shm)
- [Live SQLite WAL](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite-wal)
- [Permission forward-fix report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-permission-forward-fix-report.json)
- [Production cutover post review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-production-cutover-post-review.md)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### High — SHM sidecar remains 0644

Observed file modes after independent verification:

| Artifact | Mode | Size |
| --- | --- | --- |
| Main database | `0600` | 1,490,944 bytes |
| SHM | `0644` | 32,768 bytes |
| WAL | `0600` | 0 bytes |

All files are owned by `elvis:staff` and the parent directory remains `0700`, so parent traversal currently mitigates exposure. The SHM mode still violates defense-in-depth owner-only persistence requirements.

### Root cause — Database chmod does not govern later sidecar creation

The first forward-fix changed only the already-created main database. A later process opened the WAL database under the host default umask and created or retained SHM as `0644`. This proves that file-level chmod alone cannot enforce future sidecar permissions; every Runtime and verification process must set `umask 077` before SQLite open.

### Pass — Database content remains correct

Main database SHA-256 did not change during the first permission fix. Independent counts remain 38/6,689/0 and integrity remains `ok`; cutover remains `forward_fix_only`.

## 最终建议

1. Apply a second one-shot forward-fix that requires quiescence, verifies all three files are owned by the current operator, records modes/hashes, and changes SHM to `0600` without modifying bytes.
2. Run the verification process itself under `umask 077`; after readonly open, require main/WAL/SHM all remain `0600`, counts unchanged and integrity `ok`.
3. Persist a sidecar permission report binding before/after modes and hashes to batch `20260712T065413Z`.
4. Make `umask 077` mandatory in the later production Runtime start command. Do not start Runtime until that command boundary is available and reviewed.

## 后续门禁

- OpenSpec：继续使用 active `harden-agent-runtime-single-node-production`；这是同一 persistence security contract 的 forward-fix。
- Superpowers：继续 fix → verify → Review，不进入下一 Stage 0 gate。
- Rollback：禁止删除 SQLite artifacts 或恢复 JSON writes。
- Dashboard/tasks：保持不变，2.6/2.7 不得勾选。
- 人工审批：执行第二次 sidecar permission forward-fix 前再次确认。
- 项目规则：未修改。
