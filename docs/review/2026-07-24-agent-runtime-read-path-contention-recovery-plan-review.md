# Agent Runtime Read-Path Contention Recovery Plan Review

## 结论

**通过。** 当前修订版计划 SHA-256 为 `9e02b8518903f2cbc7f86eb0e3950b7791e97ad897b5ae5268013de304a8cbef`。首次覆盖验证发现仓库没有根目录 Maven wrapper，原命令 `./mvnw -f backend/pom.xml test` 无法执行；计划已只把它修正为本机已确认可用的 `mvn -f backend/pom.xml test`，并重新完成本次 Preflight Review。计划在 active `harden-agent-runtime-single-node-production` 已批准契约内恢复内部读路径，不改变 API/schema、Unit of Work、SSE replay、tenant/user scope、workload 或 Gate D threshold。TDD、strict evidence、成熟库短回归、停止条件与禁止 Git/正式 promotion 边界完整，可以继续执行。

## Review 范围

- [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-read-path-contention-recovery.md)
- [Attempt 004 结果 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-004-result-review.md)
- [SQLite Runtime adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Runtime event interface](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- [session detail route](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [active agent-runtime delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical

无。

### Important

1. 计划明确保留 lifecycle mutation 的 `database.transaction()` / `BEGIN IMMEDIATE`，只移除纯 `SELECT` adapter 的写锁获取，符合 Transactional Runtime Lifecycle。
2. `forExecution` 是内部 read interface；显式/最新 execution、完整 owner scope、cursor order 与空结果语义均在计划中固定。Session detail 现状本就把完整 conversation events 过滤到一个 execution 后才派生 progress，因此结果等价。
3. 完整 `since()` 保留给 SSE replay；计划要求现有 cursor/replay-live tests 不变，避免用性能修复削弱 durable replay。
4. 计划不增加 migration/index，避免在根因尚未完成真实短回归前扩大持久化写成本或 schema 风险。
5. mature clone regression 使用原 4GB 状态、真实 Java 与固定 workload，只缩短观察时长；它只决定 Attempt 005 资格，不冒充正式 Gate D。
6. 计划没有 commit、push、archive、dashboard 状态更新或 production promotion 步骤。
7. 修订版验证命令均指向仓库实际工具；Maven 命令修正不改变实现、证据门槛或执行范围。

### Advisory

1. 未增加 execution event index 意味着 SQLite 仍可能扫描该 scope 的 event key range，但只 decode 目标 execution。若成熟库短回归不足，必须用新 evidence 决定索引/投影架构，不能在本计划内追加 schema 变更。
2. 先前 readonly benchmark 使 Attempt 004 的 transient `-shm` mtime 发生读取锁更新；SQLite main、report、journal、WAL size/inode 均未改变。后续计划已禁止再次直接打开原 evidence，并要求使用 APFS clone。

## 最终建议

按 Task 1、Task 2 顺序完成两个独立 RED/GREEN，再执行 focused/full verification 与 High Review。只有 Review PASS 才创建成熟库短回归 evidence；只有计划内资格线全部满足才准备 Attempt 005。

## 后续门禁

- **OpenSpec proposal：** 不需要新增；现有 active change 明确批准单节点 SQLite lifecycle、scoped replay 与固定性能 gate。
- **Superpowers plan：** 当前 revision 已通过 Preflight Review；plan 内容发生任何 material 修改必须重新 Review。
- **测试：** 必须按计划执行 TDD、full verification、High Review 和成熟库 10 分钟短回归。
- **人工审批：** 用户已授权本地闭环实施；正式 24 小时 Gate D 与结果 promotion 仍需独立门禁。
- **Dashboard：** 不修改，尚未达到 `verified`。
- **项目规则：** 本 Review 未修改项目规则。
