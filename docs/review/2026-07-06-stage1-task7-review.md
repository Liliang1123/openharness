# Stage 1 Task 7 (Durable Trace Outbox) Code & Verification Review

- **Review 日期**：2026-07-06
- **结论**：`通过`
- **Review 范围**：
  - [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/traceOutbox.ts)
  - [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts)
  - [TraceService.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/TraceService.java)
  - [TraceServiceTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/TraceServiceTest.java)
  - [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
  - [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/stage1-gate-b.md)

## 主要发现

### 1. Durable Trace Outbox 设计与可靠性
- **可靠的状态流转**：[traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/traceOutbox.ts) 实现了 `dispatchTraceOutboxBatch`。它从 SQLite outbox 获取未投递的 trace，并转换为 Java Gateway 支持的 `TraceEvent` 进行投递。重试延迟控制和最大尝试次数（`maxAttempts`）工作完好，投递超限时置为 `dead_letter` 状态，并同时触发 `readinessDegraded`，这为系统的高可用性监控（如健康检查判定）提供了极好的前置预警能力。
- **防止重复与断点续传**：如果向 Java 投递成功，则使用 SQLite 事务标记 `delivered`。如在 Ack 回写数据库前进程崩溃，重启后 dispatcher 可自动重新扫表并重新投递，符合端到端“至少一次（At-Least-Once）”投递保证。

### 2. Java 端的端到端去重 (At-Least-Once to Exactly-Once)
- **事件去重保障**：[TraceService.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/TraceService.java) 利用 `committedEventIds`（`HashSet` 结构）对包含 `committedEventId` 的事件进行了去重。即便 TS 端在投递后未能成功写入 Ack 而重发，Java 端也会过滤掉已写入的重复数据，从而实现了端到端“精确一次（Exactly-Once）”的持久化效果。
- **线程安全性**：去重及写入操作使用了同步锁（`synchronized`），保证了多线程并发请求时的集合安全。

### 3. 数据完整性 (Negative Search)
- 进行了负向搜索扫描，确认系统中没有对 outbox 事件进行物理删除或残留未处理状态。所有已投递和死信事件均保留在 SQLite 中（`pending | retry | delivered | dead_letter`），有利于后期的生产审计和异常追溯。

### 4. 测试覆盖
- 两个子系统的测试均已顺利运行通过，覆盖了连接中断、重启重试、死信队列及 Java 去重等关键路径。

## 最终建议
- **去重内存占用控制（长期风险）**：目前 [TraceService.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/TraceService.java) 的 `committedEventIds` 保存在内存的 `HashSet` 中。在长期运行且 Trace 数据海量的生产环境中，这个集合会持续膨胀造成内存抖动。鉴于目前处于单机生产演练阶段，目前实现足以应对当前 soak。后续建议在进入 Stage 3 性能/稳定性测试时，可以引入带有 TTL 或 LRU 淘汰机制的本地缓存（如 `Caffeine` 或 `Guava`），防止集合无限增长。

## 后续门禁与下一步
- **Gate 状态**：Stage 1 Gate B 依旧保持 Pending 状态。
- **下一步任务**：根据计划，接下来可以完成 Stage 1 尚未收口的 Task 6（重启恢复、导入、IDOR 边界）和 Task 8（JSON 导入、Quarantine 校验与 Gate B 恢复演练）。
