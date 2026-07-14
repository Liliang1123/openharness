# Gate B Isolated Import Rehearsal Review

## 结论

通过：backup/restore batch `20260712T065413Z` 已在 isolated rehearsal SQLite 中完成 migration 与两次 JSON import。First/second import 均报告 38 conversations、6,689 messages、0 memory facts；SQLite 最终计数一致，idempotent rerun 未产生重复。1 个 legacy pending-approval JSON 按批准决策进入 quarantine，manifest 只包含 path/hash/error 安全字段。`PRAGMA integrity_check` 返回 `ok`，总耗时 176 ms。

该“通过”只关闭 isolated importer rehearsal slice，不关闭 Gate B，不授权 production/live SQLite target first write、cutover promotion、Stage 0 task 2.6/2.7 勾选或 dashboard 状态提升。Live SQLite target 仍不存在。

## Review 范围

- [Operational rehearsal script](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/run-isolated-import-rehearsal.ts)
- [Isolated rehearsal directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/import-rehearsals/gate-b/20260712T065413Z/)
- [Isolated rehearsal SQLite](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/import-rehearsals/gate-b/20260712T065413Z/runtime-v1.sqlite)
- [Importer backup manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/import-rehearsals/gate-b/20260712T065413Z/importer-backup-manifest.json)
- [Importer quarantine manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/import-rehearsals/gate-b/20260712T065413Z/quarantine-manifest.json)
- [Importer cutover state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/import-rehearsals/gate-b/20260712T065413Z/cutover-state.json)
- [Isolated import report](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/isolated-import-report.json)
- [Owner mappings](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/owner-mappings.json)
- [Restore source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/restore-rehearsals/gate-b/20260712T065413Z/)
- [Live SQLite target directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/)
- [JSON importer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/jsonImporter.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite repositories](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeRepositories.ts)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Restore rehearsal review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-isolated-restore-rehearsal-review.md)

## 主要发现

### Pass — Production-shape data imports with exact counts

Importer consumed the isolated restore copy, not live source. Both runs reported exactly 38 conversations, 6,689 messages and 0 memory facts. Direct SQLite table counts after the second run matched those values, demonstrating that report counts and persisted state agree.

### Pass — Idempotent rerun and integrity oracle satisfy rehearsal gate

The second import produced the same logical result without increasing database counts. `PRAGMA integrity_check` returned `ok`. The isolated database is readable after Runtime database close and contains no duplicate logical rows from the rerun.

### Pass — Approved quarantine remains fail-explicit and secret-safe

Exactly one legacy pending-approval artifact was quarantined. The generated quarantine manifest contains only `path`, `sha256` and `error` fields and no `content` field. `allowCutoverWithQuarantine` was enabled only for this explicitly approved artifact; legacy approval state was not restored.

### Pass — Tenant/user ownership is preserved

All 38 original tenant/conversation keys remain distinct across 9 tenants and map to the approved `user-001`. Import did not collapse tenant scopes or infer tenant IDs from the frontend default.

### Resolved — Operational script directory creation defect

The first host execution failed before database creation because the script attempted to create the batch directory with `recursive:false` while its parent did not exist. After explicit user authorization, the script was corrected to create the `0700` parent first and then create the batch directory with no-overwrite semantics. The corrected execution passed all original assertions; no acceptance criterion was removed or weakened.

### Pass — Live first-write boundary remains intact

The only SQLite file created is under the isolated import rehearsal root. The live SQLite target remains absent before and after the rehearsal. No source file, dashboard entry, OpenSpec task or Runtime configuration was changed.

## 最终建议

1. Prepare a production cutover preflight bundle from the same immutable backup/evidence batch, including service quiescence check, source re-snapshot, disk/permission check, abort owner, forward-fix marker and exact live-target command preview.
2. If live source has changed since batch `20260712T065413Z`, create a new immutable backup/restore/import batch instead of reusing stale evidence.
3. Only after the production cutover preflight Review passes should the user make the final first-write promotion decision. Do not infer that decision from isolated rehearsal success.
4. After first live SQLite write, prohibit binary rollback to JSON and use forward-fix only; any restore must follow the approved incident procedure.

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不新增 change。
- Superpowers：下一节点为 strict production cutover preflight Review，不是 Runtime parity。
- Production first write：仍 BLOCKED，直到 source freshness/quiescence、cutover command、abort boundary and human promotion are recorded together.
- Dashboard/tasks：不得更新 Stage 0 状态或勾选 2.6/2.7。
- 人工审批：用户的持续授权覆盖同范围可逆 evidence slices；live first-write promotion 仍需在 cutover preflight PASS 后单独记录。
- 项目规则：未修改。
