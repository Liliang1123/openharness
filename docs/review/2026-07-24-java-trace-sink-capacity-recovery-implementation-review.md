# Java Trace Sink 容量恢复实现 Review

## 结论

**通过。** Java trace sink 的完整 event、committed identity 与生产默认 stdout 已全部由无界增长改为有界/低频行为，同时保持 POST ingest `202`、当前单 Runtime outbox 可达重复窗口和 Integration trace-lineage oracle。无 Critical 或 Important 未关闭 finding，可以进入最终固定 60 分钟真实恢复回归。

本结论不扩展 Java restart durability，也不代表正式 24 小时 Gate D 已通过。

## Review 范围

- [容量边界 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-trace-sink-capacity-boundary-review.md)
- [容量恢复计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-java-trace-sink-capacity-recovery.md)
- [计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-trace-sink-capacity-recovery-plan-review.md)
- [TraceService implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/service/TraceService.java)
- [TraceService tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/service/TraceServiceTest.java)
- [P0a Integration trace oracle](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/integration-tests/test/p0a.integration.test.ts)
- [backend-gateway OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/backend-gateway/spec.md)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. 完整 events 使用 `ArrayDeque`，production 上限固定 `10,000`；每次 accepted event 后从头部删除超限旧项，heap 不再随运行时长线性增长。
2. committed identities 使用 access-order `LinkedHashMap` LRU，production 上限固定 `100,000`；duplicate `get` 会刷新最近性，当前可能重投的 identity 不会被普通新 event 提前淘汰。
3. backend-native events 没有 `committedEventId`，不会占用 Runtime outbox identity LRU。
4. duplicate identity 仍在记录前返回，因此 Controller 继续正常 `202` acknowledgement 且只保留一个逻辑 event。
5. 默认 INFO 不序列化或输出逐事件 JSON；每 `100,000` 次 attempt 仅输出 attempts、accepted、duplicates、retainedEvents 与 committedIdentities 聚合数字。
6. 显式开启 `TraceService` DEBUG 时才输出 `trace_event=` marker 和 JSON。P0a Integration 启动参数显式开启该 logger 并解析 marker；正式恢复回归未开启 DEBUG，因而不会恢复历史 1.85 GB/hour 日志增长。
7. package-private 小容量 seam 只用于 deterministic tests；Spring production constructor 通过 `@Autowired` 明确选择，外部 request/env 不能改变容量上限。
8. `events()` 仍返回 immutable recent snapshot，现有 Backend API 属性保留测试继续通过。

### 验证记录

- TDD RED：
  - bounded test 初次编译因 `IngestionSummary` 与小容量 seam 尚不存在而失败；
  - 默认 stdout test 在旧实现下会观察逐事件 JSON；
  - 删除默认逐事件 stdout 后，P0a reasoning/trace-continuity 两个 oracle 均按 5 秒 timeout RED，证明 Integration 确实依赖旧 stdout。
- 实施中 finding：
  - 增加 test constructor 后，Spring 首次 Backend API focused test 因构造器选择不唯一而启动失败；
  - 显式 `@Autowired` production constructor 后，同一 focused test 转 GREEN。
- TraceService：3/3 PASS。
- TraceService + Backend API focused：19/19 PASS。
- Java full：210 tests，0 failures，0 errors。
- Integration：5 files / 17 tests PASS；trace continuity 实际观察 frontend、agent-runtime 与 backend 共用 trace id。
- 当前 TypeScript/Frontend 源状态的 workspace full：741 tests PASS；Java 改动后受影响 Integration 已单独 fresh rerun。
- workspace typecheck：PASS。
- OpenSpec strict、dashboard check、`git diff --check`：PASS。
- static check：`TraceService` 不含 `System.out`/`System.err`；唯一 event serialization 位于 `LOG.isDebugEnabled()` 保护后的 DEBUG marker。

### Advisory

1. `100,000` identity 上限的正确性绑定当前 OpenSpec 单 Runtime、单串行 dispatcher、batch `100`。未来任何多 Runtime writer、并行 batch、batch 扩大或 Java restart durability 都必须重新设计。
2. 显式 DEBUG 会恢复逐事件诊断体积，只应短时用于 Integration/排障；正式长跑和生产 profile 应保持 INFO。

## 最终建议

冻结当前 Runtime、storage monitor 与 Java trace sink 源状态。创建全新 attempt 004 evidence directory，以新 source hash 执行一次固定 60 分钟真实恢复回归；重点复核 admission p95、Java log growth、Java/Runtime 存活、WAL/disk monitor、outbox backlog 与固定 hard-fail oracle。

## 后续门禁

- **OpenSpec proposal：** 当前不新增。
- **Superpowers plan：** attempt 004 必须有独立计划与 preflight Review。
- **测试：** 固定 60 分钟恢复回归通过后才能形成新的本地完成结论。
- **人工审批：** 正式 24 小时 Gate D start approval 与 post-result promotion approval 仍需独立、不可预授权。
- **归档 / dashboard：** attempt 004 通过也不得自动归档或把 dashboard 标为 `verified`；正式 Gate D 尚未满足。
