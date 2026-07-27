# Java Trace Sink 容量边界 Review

## 结论

**通过。** 可以在现有 `harden-agent-runtime-single-node-production` OpenSpec change 内实施最小容量修复，无需新增 proposal，但必须严格保持 Runtime committed-event 幂等窗口与 POST ingest API 不变。

允许的实现是：把 Java 内部 `events()` 诊断保留改为固定最近窗口、把 committed event identity 改为远大于单批未确认上限的有界 LRU，并把生产默认逐事件 stdout 改为无 payload 的低频聚合计数。现有 Integration trace oracle 可通过显式开启 `TraceService` DEBUG logger 保留带稳定 marker 的逐事件诊断；正式 Runtime/Java 长跑不得开启该 DEBUG logger。不得增加持久化、改变 HTTP schema/status、改变 Runtime retry/batch policy，或声称 Java restart 后幂等；后者已明确是 active change 的 non-goal。

## Review 范围

- [TraceService](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/service/TraceService.java)
- [TraceController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/api/TraceController.java)
- [TraceService tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/service/TraceServiceTest.java)
- [Backend API tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/BackendApiTest.java)
- [backend-gateway OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/backend-gateway/spec.md)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [60 分钟恢复结果 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-result-review.md)

## 主要发现

### Critical

当前 `TraceService` 对每个 accepted trace 同时执行三个无界动作：

1. 把完整 `TraceEvent` 永久追加到 `ArrayList`；
2. 把每个 `committedEventId` 永久追加到 `HashSet`；
3. 把完整 JSON event 逐条写 stdout。

真实 60 分钟回归已观察 Java log 增长 `1,849,536,286 bytes`、accepted trace `3,070,352`。按同一负载线性外推，24 小时仅 stdout 约增长 44 GiB，完整 event/list/set heap 也持续增长；这与 Java Gateway 必须在固定 24 小时期间持续存活相冲突。

### Important

幂等缓存不能简单删除。active OpenSpec 要求 Runtime outbox 的 at-least-once retry 由 Java 按 committed durable event identity 去重。

在已批准单 Runtime/单 dispatcher 语义下，可到达的“Java 已记录但 Runtime 尚未原子确认”的集合最多等于一个 dispatch batch，即 `100`：

- dispatcher 不并行执行多个 batch；
- Java 网络调用完成后，同批状态在一次 SQLite transaction 中原子确认；
- transaction 失败或 Runtime 崩溃时，该批保持未确认并重投；
- Java 原生 trace 没有 `committedEventId`，不会挤占 Runtime committed identity 窗口；
- Java Gateway restart durability 明确不在当前 change 范围。

因此固定 `100,000` 个最近 committed identities 是单批可达窗口的 1,000 倍，保持当前批准拓扑下的幂等契约，同时消除无界 heap 增长。若未来允许多个 Runtime writer、并行 batch、Java restart durability 或更大 batch，必须重新做 OpenSpec 变更。

### Advisory

`events()` 没有 HTTP 查询 endpoint，只被 Java tests 用作进程内诊断读取；把它限制为最近 `10,000` 条不会改变 POST ingest contract。Runtime SQLite 仍是 durable trace/outbox authority。

## 最终建议

以 TDD 实施：

- recent events 上限 `10,000`；
- committed identity LRU 上限 `100,000`，duplicate access 刷新最近性；
- 每 `100,000` 次 ingest attempt 最多输出一条无 event payload、无 identity 的聚合日志；
- 默认 INFO 不序列化/输出单条 event；显式 DEBUG 诊断使用 `trace_event=` marker，供现有 Integration trace-lineage oracle 使用；
- 保持 duplicate 请求继续返回 HTTP `202` 且只记录一个逻辑 event；
- 通过 package-private 小容量 seam 做 deterministic bounded tests，production 常量不可由请求或环境任意放宽。

## 后续门禁

- **OpenSpec proposal：** 当前不新增；上述边界外任何 retention API、durable Java store、restart dedupe、batch/retry 调整都需要新 proposal。
- **Superpowers plan：** 需要单独可执行计划与计划 Review。
- **测试：** TraceService TDD、Backend API、显式 DEBUG Integration oracle、Java full、workspace/integration 回归与新的固定 60 分钟真实恢复回归。
- **人工审批：** 本地容量修复不需要；正式 24 小时 Gate D 与 promotion 仍需独立审批。
- **归档 / dashboard：** 当前不得归档 active change或更新 dashboard 状态。
