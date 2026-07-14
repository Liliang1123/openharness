# Gate B Isolated Restore Rehearsal Review

## 结论

通过：backup batch `20260712T065413Z` 已恢复到独立、Git-ignored restore rehearsal directory。44 个 restored files、1,178,212 bytes 与 backup manifest 的 relative path、size 和 SHA-256 全部一致，0 missing、0 unexpected、0 hash mismatch；live source 在演练期间保持稳定且未被覆盖。Measured restore RTO 为 30 ms，满足 Stage 0 plan 的 ≤30 minutes threshold。

该“通过”只关闭 pre-cutover restore rehearsal slice，不关闭 Gate B，不授权写 live SQLite target、production cutover、Stage 0 task 2.6/2.7 勾选或 dashboard 状态提升。SQLite target 仍不存在。

## Review 范围

- [Backup batch](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/20260712T065413Z/)
- [Backup manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/20260712T065413Z/backup-manifest.json)
- [Isolated restore directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/restore-rehearsals/gate-b/20260712T065413Z/)
- [Restore report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/restore-report.json)
- [Pre-cutover evidence batch](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/)
- [Live history source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/sessions/)
- [Live memory source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/memory/)
- [Live SQLite target directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Backup manifest pre-cutover review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-backup-manifest-precutover-review.md)

## 主要发现

### Pass — Restore oracle 完整满足

Restore 从 immutable backup copy 读取，不从 live source 重建。验收同时比较 relative path、file count、byte count 和 SHA-256；44/44 files 匹配，hash mismatch、missing file、unexpected file 均为 0。

### Pass — RTO threshold 满足

从 isolated target 创建、copy、逐文件 hash verification 到 atomic staging rename 的 measured elapsed time 为 30 ms，显著低于 approved plan 的 30-minute RTO threshold。该结果适用于当前 1,178,212-byte source volume；数据规模扩大后必须重新测量。

### Pass — Live source 与 SQLite boundary 未被突破

Restore target 与 live sessions/memory 分离，live source 未被覆盖且在 restore 后仍与 backup manifest 一致。SQLite target 不存在；没有运行 importer、migration runner、Runtime cutover 或 SQLite command。

### Pass — Quarantine boundary 保持分离

Restore 还原完整 backup bytes，但 quarantine decision 继续独立保存在 evidence batch。Legacy pending approval 不因 restore 被视为可恢复审批，也没有被导入运行时状态。

### Observation — RPO 仍需 cutover 语义确认

本轮证明 restore RTO，不自动证明 ongoing backup schedule RPO。Production cutover snapshot 若在 source quiesced 且 hash-stable 条件下生成，可把 cutover-point data loss oracle 定义为 zero observed source changes；长期运行的 backup frequency/RPO 仍需运维策略单独承担。

## 最终建议

1. 下一切片只在 isolated rehearsal SQLite path 运行 importer，使用 restore copy、38 项 `user-001` mapping 和批准的 quarantine decision；禁止使用 live SQLite target。
2. Import oracle 应验证 38 conversations、6,689 messages、0 memory facts、1 quarantined JSON、idempotent rerun counts 和 SQLite integrity check。
3. Isolated import PASS 后生成 production cutover preflight bundle，再进行独立 Review；live target first write 仍需明确 promotion decision。
4. Ongoing backup RPO 不应由本次 restore RTO 替代；Stage 0 final operations closeout 必须记录备份频率和 owner。

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不新增 change。
- Superpowers：下一节点为既有 Task 8 的 isolated importer rehearsal，仍使用 strict evidence profile。
- 生产写入：只允许 isolated rehearsal SQLite；live SQLite target 继续禁止写入。
- Dashboard/tasks：不得更新 Stage 0 状态或勾选 2.6/2.7。
- 人工审批：用户已授权按推荐继续同范围闭环；live target promotion、cutover/abort 与最终 evidence acceptance 仍必须在相应 Review 后显式记录。
- 项目规则：未修改。
