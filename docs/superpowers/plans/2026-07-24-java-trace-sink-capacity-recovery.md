# Java Trace Sink 容量恢复计划

> 模式：OpenSpec 精简模式；适用 change：`harden-agent-runtime-single-node-production`

## 目标

在不改变 Java trace POST API、Runtime outbox policy 或 Java restart durability 边界的前提下，消除 `TraceService` 完整 event、committed identity 与 stdout 的无界增长，使 Java Gateway 能进入固定长时验证。

## 依据

- [容量边界 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-trace-sink-capacity-boundary-review.md)
- [TraceService](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/service/TraceService.java)
- [TraceService tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/service/TraceServiceTest.java)
- [backend-gateway spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/backend-gateway/spec.md)

## 边界

允许修改：

- [TraceService.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/service/TraceService.java)
- [TraceServiceTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/service/TraceServiceTest.java)
- 必要时只调整受影响的 [BackendApiTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/BackendApiTest.java)
- 为保留既有 trace-lineage oracle，可调整 [P0a integration test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/integration-tests/test/p0a.integration.test.ts)，但只允许显式启用 DEBUG 诊断并解析稳定 marker；
- 本次计划、Review 与验证证据。

禁止修改：

- TraceController path、request/response schema 与 `202 Accepted`；
- Runtime outbox batch `100`、concurrency `20`、retry delay `1s`、max attempts `5`；
- Java persistence/restart durability；
- Runtime SQLite retention/schema；
- 固定 performance workload、sample interval 或 thresholds。

## Task 1：TDD

1. 保留既有 duplicate identity test。
2. 新增小容量 constructor seam 测试，先观察当前实现无法限制 recent events 与 identities。
3. 断言 recent events 只保留最新 N 条。
4. 断言 duplicate within retained identity window 仍只记录一次且 duplicate access 刷新最近性。
5. 断言默认 INFO 不向 stdout 输出每条 event，ingest summary 仅按固定 cadence 触发且只含 aggregate counts。
6. 既有 Integration trace oracle 必须先观察到因默认逐事件 stdout 被删除而 RED，再通过显式 DEBUG marker 恢复。

## Task 2：最小实现

1. `ArrayList` 改为有界 recent deque，production 上限 `10,000`。
2. `HashSet` 改为 access-order `LinkedHashMap` LRU，production 上限 `100,000`。
3. backend-native event 不进入 committed identity LRU。
4. 默认 INFO 删除 per-event JSON serialization/stdout；每 `100,000` 次 attempt 记录一次 accepted/duplicate/retained/identity-size 聚合。
5. 仅在 `TraceService` logger 显式启用 DEBUG 时序列化单条 event，并用 `trace_event=` marker 输出；正式长跑保持默认 INFO。
6. 保留同步临界区、`events()` snapshot 与 Spring constructor 兼容。

## Task 3：验证

1. TraceService RED 转 GREEN。
2. 运行 TraceService、BackendApi、TraceController 相关测试。
3. 运行 Java full 208+ tests、workspace tests/typecheck、OpenSpec strict、dashboard check 与 `git diff --check`。
4. 独立实现 Review；确认无 per-event stdout、heap 有界、duplicate HTTP ack 与 identity contract 不变。
5. Review 通过后，以最终 source hash 创建 attempt 004，一次性执行新的固定 60 分钟真实恢复回归。

## 非目标

- Java trace 查询/导出产品能力；
- durable trace backend 或跨 Java restart dedupe；
- trace retention 配置 UI；
- 正式 24 小时 Gate D 或 promotion。
