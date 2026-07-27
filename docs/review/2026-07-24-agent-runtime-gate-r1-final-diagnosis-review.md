# Agent Runtime Gate R1 最终诊断 Review

## 结论

通过：Gate R1 根因诊断完成。共同 admission / durable replay 退化的主因是 session detail 随会话历史增长而同步执行重复全量 replay；pending outbox partial index 是 material contributing，但不是主因。生产 trace outbox dispatcher 缺失、非 trace 事件进入 pending、trace claim 可被饿死是必须同时关闭的 Critical 正确性缺口。修复均落在现有 active OpenSpec change 内，不需要新 proposal。

本结论不是 Gate D PASS，也不授权降低 workload、100ms / 250ms 阈值或跳过 60 分钟回归。

## Review 范围

- [三变量诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-three-variant-diagnosis-review.md)
- [窄诊断计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-gate-r1-targeted-diagnosis.md)
- [窄诊断计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-targeted-diagnosis-plan-review.md)
- [机器可读窄诊断 evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260724-targeted-diagnosis.json)
- [analyzer decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-decision.json)
- [session detail implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Runtime storage schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [production Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec agent-runtime delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical — session replay growth 是性能主因

- 三变量末 10 admission 中位数均约 121–124ms，移除 full oracle 没有 material improvement，证明退化来自三个变体共有的 Runtime workload 路径。
- session detail 对同一 scope 先读取 `scopedEvents`，随后 `progressForSession()` 再执行相同 `since(..., null)`，每个 durable replay poll 都发生两次同步 SQLite query 和 payload decode。
- readonly 微基准对 360-row scope 交替执行 2,000 轮：
  - single median/p95：0.915/0.989ms；
  - double median/p95：1.833/1.972ms；
  - ratio：2.003x/1.994x。
- Gate D 使用 20 concurrency 并持续轮询 session detail；重复同步工作在单 Node event loop 上累积，能够同时抬高 session response 和新 stream admission。

根因判定：`session-replay-growth = confirmed primary`。

### Critical — durable outbox lifecycle 未完成

- incremental SQLite 的 3,525,521 条 runtime event 全部 pending，其中 trace 1,762,134 条、非 trace 1,763,387 条。
- 生产 Runtime 没有启动或停止 `dispatchTraceOutboxBatch()`，也没有将 dead-letter 状态接入 readiness。
- `claimOutbox()` 从所有 pending/retry 取 limit 后才过滤 trace，非 trace 老记录可以永久饿死 trace。
- 当前 index 与 claim order 不一致，SQLite 使用 temporary B-tree。

根因判定：`production-trace-outbox-dispatcher-absent` 等为 confirmed correctness gaps。

### Important — pending index 是次要性能贡献

在相同 3.5M-row APFS clone 上，每轮 rollback 10,000 次 deterministic insert，交替 6 轮：

- with-index median/p95：36.258/38.218ms；
- without-index median/p95：32.144/32.605ms；
- overhead：12.8%/17.2%。

该结果低于预设 20% 主因线，但高于 10% contributing 线。根因判定：`outbox-index-growth = contributing, not primary`。

### Important — full oracle 不是主因但不可保留现状

full-oracle 末 10 probe duration 中位数为 3.60s、最大 3.97s；incremental-oracle 末 10 中位数仅 63ms。正式 24 小时运行若继续全表 duplicate/secret scan，会随数据库增长破坏 30 秒采样预算。必须改为等价增量检查或由数据库 constraint 加增量 evidence 证明，不能删除 oracle。

### Important — evidence 与清理

- 原始 SQLite 的 inode、size、mtime 和 sidecar absence 在两个微基准前后保持不变。
- machine-readable evidence 为 no-overwrite、mode `0600`。
- 临时 clone 已整体移动到 [系统废纸篓中的可恢复目录](file:///Users/elvis/.Trash/openharness-gate-r1-outbox.EtkNsC/)；项目目录和 `/private/tmp` 均未遗留 clone。
- Java、Runtime、MCP 与端口 `18084` 已全部清理。

## 最终建议

在现有 active change 下创建一个 TDD recovery plan，分三个可独立验证的 slice：

1. **Session detail 单读复用：** 把已读取的 `scopedEvents` 传给 progress derivation，保证每个 session request 只调用一次 `since(null)`；保留现有 API 和完整 messages contract。
2. **Durable trace outbox 完整 lifecycle：** 只有 trace event 进入 pending；SQL claim 直接限定 trace 并使用匹配 order/retry 的 index；生产 server 启停 dispatcher；retry/dead-letter/readiness/close 全部 fail-closed。
3. **Formal oracle 等价增量化：** cursor 增量验证 ordering、secret、busy 与 delivery transition；duplicate 由数据库 unique constraint 加增量检查证明；dead-letter/orphan 使用有界索引查询。不得降低任何正式 Gate D 检查。

每个 slice 都必须先写会失败的 RED 测试，再最小 GREEN；完成后执行 focused/full tests、独立 High Review 和固定 60 分钟 local regression。回归 PASS 后才能准备新的 24 小时 Gate D packet。

## 后续门禁

- **OpenSpec proposal：** 不需要新增。API、retention、持久化/outbox 语义与固定 Gate D workload/threshold 均不改变；实施是对 active contract 的补齐和等价优化。
- **Superpowers plan：** 下一步必须创建具体 TDD recovery plan，并在实施前 High Review `通过`。
- **测试：** RED/GREEN、Agent Runtime full、Java full、integration、OpenSpec strict、Dashboard check、60 分钟回归和 24 小时 Gate D 均必需。
- **人工审批：** 用户已授权持续实施；production promotion 仍需在正式 Gate D 实际 PASS 后单独判定。
- **Dashboard：** 当前诊断未触发 `verified`，不修改 Dashboard。
- **项目规则：** 未修改。
