# Gate B Backup Manifest Pre-Cutover Review

## 结论

通过：Gate B project-local source hardening 与只读 backup/hash preflight 已完成。sessions source 已从 `0755` 收紧为 `0700`；batch `20260712T065413Z` 完成 44 个文件、1,178,212 bytes 的不可变 copy，source copy 前后 snapshot 一致，copied file hashes 与 source 全部一致。38 个 legacy history scopes 已生成 `user-001` owner mappings，1 个 legacy pending-approval JSON 已按批准决策记录为 secret-safe quarantine，5 个 Markdown auxiliary files 已备份但不交给 JSON importer。

该“通过”只授权进入独立 restore rehearsal 的下一 pre-cutover slice，不关闭 Gate B，不授权 first SQLite write、production cutover、Stage 0 task 2.6/2.7 勾选或 dashboard 状态提升。SQLite target 在本切片结束时仍不存在。

## Review 范围

- [History source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/sessions/)
- [Memory source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/memory/)
- [Gate B backup batch](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/20260712T065413Z/)
- [Backup manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/20260712T065413Z/backup-manifest.json)
- [Gate B evidence batch](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/)
- [Owner mappings](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/owner-mappings.json)
- [Quarantine decision](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/quarantine-decision.json)
- [Pre-cutover state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/precutover-state.json)
- [SQLite target directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/)
- [JSON importer](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/jsonImporter.ts)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Path/source inventory review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-project-local-path-and-source-inventory-review.md)

## 主要发现

### Pass — Source hardening 与不可变 backup 已闭环

sessions source mode 为 `0700`。Backup 使用独立时间戳 batch，不覆盖已有目标；copy 前后的 source path/size/hash snapshot 相同，backup copy 的 path/size/hash 与 source 相同。Source 无 symlink，未读取或输出消息内容。

### Pass — Owner mapping 保留 tenant boundary

首次生成尝试因错误假设所有 history 均属于默认 `tenant-001` 而按 stop condition 中止；当时只完成 sessions permission hardening，没有建立 staging、backup、evidence 或 SQLite 文件。聚合诊断确认 38 个 history 分布在 9 个 tenant，18 个不属于默认 tenant，但 38 个 path scope 全部匹配文件内 tenant/conversation scope。

纠正后的 mapping 不重写 tenantId 或 conversationId，仅按用户批准将每个原始 `(tenantId, conversationId)` scope 映射到 `user-001`。最终 mapping count 为 38，无 scope mismatch、parse failure 或 conflicting embedded userId。

### Pass — Pending approval 与 auxiliary files 未被静默丢弃

Legacy pending-approval JSON 不作为 stable history 导入；evidence 只记录相对 path、SHA-256、size、reason code 和 quarantine decision，不复制原始审批内容。5 个 Markdown auxiliary files 进入 backup/hash 覆盖，但不会进入 JSON importer。

### Observation — 当前 measurement 尚不能关闭 RPO/RTO

Backup 完成时间与 source 最新 mtime 的差值为 85,492 seconds。该值是本次静态 source 的 freshness observation，不等于已批准的 production backup RPO；当前仍缺明确 RPO target。Restore 尚未执行，因此没有 measured restore RTO 或 restore oracle 结果。

### Pass — First-write boundary 未突破

SQLite target 不存在；本切片只修改 source directory mode并写入 Git-ignored backup/evidence roots。没有运行 JSON importer、migration runner、Runtime cutover 或任何 SQLite command。

## 最终建议

1. 下一切片在新的临时 restore directory 恢复 batch `20260712T065413Z`，重新计算 44 个 file hashes，并记录 measured restore RTO；禁止恢复到 live source 或 SQLite target。
2. Restore oracle 应要求 file count、byte count、relative paths 和 SHA-256 全部与 backup manifest 一致，并确认 quarantine/evidence files 与 source copy 分离。
3. Restore Review PASS 后再准备 importer dry-run / isolated SQLite rehearsal；first production SQLite write 仍需独立 evidence acceptance 与人工 promotion。
4. 在 Gate B promotion 前明确 production RPO target；当前 85,492-second observation 不应自动判定 PASS。

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不新增 change。
- Superpowers：继续既有 Task 8 strict evidence flow；下一节点为 isolated restore rehearsal。
- 生产写入：未授权 first SQLite write；SQLite target 必须继续保持不存在。
- Dashboard/tasks：不得更新 Stage 0 状态或勾选 2.6/2.7。
- 人工审批：restore rehearsal 可在独立临时目录执行；RPO target、first-write promotion、cutover/abort 和最终 evidence acceptance 仍需明确。
- 项目规则：未修改。
