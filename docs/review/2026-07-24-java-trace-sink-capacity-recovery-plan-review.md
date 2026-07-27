# Java Trace Sink 容量恢复计划 Review

## 结论

**通过。** 计划严格遵守容量边界 Review：只改变 Java 进程内诊断保留与日志频率，不改变 HTTP、Runtime outbox、持久化或 restart durability 契约；TDD 与后续真实回归门禁完整，可以实施。

## Review 范围

- [容量恢复计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-java-trace-sink-capacity-recovery.md)
- [容量边界 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-trace-sink-capacity-boundary-review.md)
- [TraceService](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/service/TraceService.java)
- [TraceService tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/service/TraceServiceTest.java)
- [backend-gateway spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/backend-gateway/spec.md)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. recent event `10,000` 与 identity `100,000` 均为固定 production constants，不由不可信请求控制。
2. identity LRU 是当前单 dispatcher 最大未确认 batch `100` 的 1,000 倍；duplicate access 更新最近性，能够保留实际 at-least-once crash window。
3. Java restart durability、多个 Runtime writer与并行 batch均不在当前 change 范围；计划没有隐式承诺这些能力。
4. 生产默认 INFO 的聚合日志不包含 event 或 identity，直接消除已观察的 1.85 GB/hour stdout 主因。
5. 显式 DEBUG marker 只用于 Integration trace-lineage oracle；固定长跑保持 INFO，因此不会恢复生产日志增长。
6. `events()` 仍保留 recent snapshot，现有 API/integration tests 无需依赖无界历史。

### Advisory

新的 60 分钟回归必须同时观察 Java log growth、Java 进程存活和 Runtime fixed oracle；单元测试不能替代真实吞吐证据。

## 最终建议

按计划以小容量 seam 先写 RED，再做最小实现。若实现需要新增持久化或调整 Runtime batch/retry，应立即停止并新建 OpenSpec change。

## 后续门禁

- **OpenSpec proposal：** 当前不新增。
- **Superpowers plan：** 当前计划已批准执行。
- **测试：** focused、Java full、workspace/integration、治理检查与固定 60 分钟回归。
- **人工审批：** 本地实施不需要；正式 Gate D/promotion 不变。
- **归档 / dashboard：** 当前不得归档或同步状态。
