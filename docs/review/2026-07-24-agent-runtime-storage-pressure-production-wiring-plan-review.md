# Agent Runtime 存储压力生产接线计划 Review

## 结论

**通过。** 计划修复的是 active OpenSpec 已批准 storage safety contract 的实现缺口，不引入新架构或产品能力；边界、TDD 顺序、fail-closed 语义和后续真实回归门禁明确，可以实施。

## Review 范围

- [存储压力生产接线计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-storage-pressure-production-wiring.md)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [现有纯 disk guard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/diskGuard.ts)
- [production server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [production lifecycle tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionServerLifecycle.test.ts)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. OpenSpec design 已明确 60 秒采样、256 MiB WAL、5 秒 contention deadline、2 GiB/10% low watermark、512 MiB/2% critical watermark及 critical drain；本计划只补 production wiring。
2. 计划复用现有阈值函数和当前 Runtime database connection，不引入第二 SQLite 写权威或 schema 变化。
3. admission gate 位于认证之后，避免未认证调用者获得存储状态；只拦截外部 mutation，不阻塞 health/read/replay 或已接受 execution 的内部 terminal write。
4. WAL BUSY 采用有界 retry episode，deadline 耗尽后继续 fail closed，不会把 5 秒 budget 叠加为无界阻塞。
5. critical callback 使用既有 lifecycle Unit of Work，能够保留 terminal event、execution 与 approval 的原子边界；失败时仍关闭进程并依赖下次 startup reconciliation 收敛。
6. 计划明确不触碰 retention、Java trace sink、outbox policy 与固定性能 oracle，避免借修复扩大 OpenSpec 范围。

### Advisory

1. critical drain 是 best-effort：磁盘已经耗尽时写入本身可能失败；测试必须覆盖 callback 只触发一次、资源最终关闭，并保留下次 startup reconciliation 的兜底。
2. storage pressure readiness reason 是现有 readiness 响应的枚举扩展；必须保持 HTTP shape 与认证行为稳定。

## 最终建议

按计划从 monitor 与 admission RED tests 开始，使用 deterministic sample/scheduler seam，不通过伪造生产磁盘或改变全局文件系统状态验证。

## 后续门禁

- **OpenSpec proposal：** 不需要新增；若实施需要改变阈值、retention、schema、retry policy 或外部持久化语义，则必须停止并重新分类。
- **Superpowers plan：** 当前计划已批准执行。
- **测试：** focused、full、typecheck、Java、OpenSpec、dashboard 与真实固定恢复回归均为后续门禁。
- **人工审批：** 本地实施无需；正式 24 小时 Gate D 与 promotion 仍需独立审批。
- **归档：** 当前不得归档 active change或更新 dashboard 状态。
