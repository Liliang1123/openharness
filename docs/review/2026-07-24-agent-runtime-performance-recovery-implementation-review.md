# Agent Runtime 性能恢复实现 Review

## 结论

通过：本轮实现关闭了 Gate R1 已确认的 session replay 重复读取、非 trace outbox 膨胀/饿死、生产 dispatcher 缺失和正式数据库 oracle 全表放大，并在实现级自审中进一步关闭生产 trace 双投递、持久 payload 身份覆盖、只读 outbox 查询占用 writer lock、migration history 断档未 fail closed 四项问题。fresh focused、workspace full、typecheck、backend、OpenSpec、Dashboard、静态门禁和 production-sized v1 → v2 rehearsal 均通过，可以进入独立的固定 60 分钟本地恢复回归。

本结论不是 24 小时 Gate D PASS，不授权生产结果晋升、OpenSpec archive 或 Runtime v1 contract freeze。

## Review 范围

### 方案与诊断

- [性能恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-performance-recovery.md)
- [性能恢复计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-performance-recovery-plan-review.md)
- [Gate R1 最终诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-final-diagnosis-review.md)

### Runtime 实现

- [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts)
- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [runtime storage schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [trace outbox batch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [Gate D formal execution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)

### Tests

- [sessions API tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sessionsApi.test.ts)
- [runtime storage tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorage.test.ts)
- [SQLite Runtime event store tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sqliteRuntimeEventStore.test.ts)
- [trace outbox tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- [trace outbox dispatcher tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutboxDispatcher.test.ts)
- [production runner persistence tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionRunnerPersistence.test.ts)
- [production server lifecycle tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionServerLifecycle.test.ts)
- [formal soak execution tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/formalSoakExecution.test.ts)
- [Gate D diagnostics tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)

### 大库验证

- [v2 migration rehearsal evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/runtime-v2-migration-rehearsal-20260724.json)

## 主要发现

### Critical

无。

### Important（已关闭）

1. **session detail 双读：** 单请求原来对同一 scope 执行两次 `since(null)`；新测试真实 RED 为 `2`、GREEN 固定为 `1`，progress 响应保持一致。
2. **outbox eligibility 错误：** schema v1 让所有 Runtime event 默认 pending；schema v2 将非 trace pending/retry 前向迁移为 `not_applicable`，repository 与 trigger 双重保证只有 trace 可进入 Java outbox。
3. **trace starvation 与索引 order：** claim 现在在 SQL 内限定 trace、pending/due retry、稳定 order/limit；`runtime_event_trace_outbox` 与 dead-letter partial index 的 query plan 均命中且没有临时 order B-tree。
4. **生产 lifecycle 缺失：** 新 dispatcher 立即启动、满批零延迟续批、空批/异常有界重试、同实例不重叠；close 等待在途投递，dead-letter 在启动与运行期都降级 authenticated readiness。
5. **生产 trace 双投递：** production persistence 原先先写 trace outbox、又直接调用 Java；现在生产 runner 只 durable commit，dispatcher 是唯一 Java delivery owner。开发/in-memory runner 保留即时 trace。
6. **身份绑定：** Java headers 与 TraceEvent 的 tenant/user/conversation/trace/request identity 都以 committed event envelope 为准，持久 payload 中的同名字段不能覆盖认证 scope。
7. **无谓 writer lock：** claim 与 status check 直接使用 SQLite read connection；每个成功 candidate 只有最终 ack transition 使用 `BEGIN IMMEDIATE`。事务计数 RED 为 `4`、GREEN 为 `1`。
8. **migration fail-closed：** migration runner 按版本逐 transaction 执行，同时校验 history 连续性；future version 与缺失历史版本均在任何业务 readiness 前拒绝。
9. **正式 oracle 全表增长：** production executor 显式使用 `formal-incremental`；七个 timing/hard-failure 类型保留，event/message canary 按独立 rowid watermark 扫描，duplicate identity 由 schema unique constraints、startup integrity 与单窗口检查共同覆盖。

### Minor / 非阻塞风险

- dispatcher 当前内部 policy 固定为 batch `100`、delivery concurrency `20`、max attempts `5`、retry delay `1s`、idle `250ms`。它是有界且有测试的，但在 Java 长时间不可用时会较快进入 durable dead-letter；未来若要变为运维可配置策略，需要重新做 OpenSpec 边界判断。
- production-sized rehearsal 的 main/WAL/SHM APFS clone 迁移端到端约 `33s`；迁移后 clone WAL 约 `1.80GB`。本机约 `154GB` free headroom 足够，正式部署仍必须遵守已有 backup、disk headroom 与 forward-fix runbook。
- Java `TraceService` 仍会输出每个 accepted trace；60 分钟恢复回归必须监控 Java log 体积，不能把 Runtime 修复后出现的 Gateway stdout 增长误判为 Runtime SQLite 回归。
- active OpenSpec 中 WAL/low-disk production wiring 的历史 Stage 1 结论不属于本次性能修复 diff；在 Runtime v1 contract freeze 前仍应结合实际 60 分钟/24 小时 evidence 再做一次契约核对，不能仅引用旧 review。

## 验证记录

- TDD RED：
  - session `since` 调用 `2 != 1`；
  - schema/outbox `6` 个预期失败；
  - trace batch `4` 个预期失败；
  - dispatcher module/readiness/lifecycle `4` 个预期失败；
  - formal-incremental `4` 个预期失败；
  - production direct trace `6 != 0`；
  - payload identity mismatch；
  - outbox transaction count `4 != 1`；
  - migration history gap 未拒绝。
- Focused GREEN：`10 files / 267 tests` PASS。
- Workspace full：shared `60` + Runtime `628` + Frontend `24` + Integration `17` = `729` tests PASS。
- `pnpm typecheck`：shared schema、Runtime、Frontend全部 PASS。
- `mvn -o -f backend/pom.xml clean test`：`208` tests PASS；后续只修改 TypeScript/tests/docs，未修改 backend source。
- `npx openspec validate --all --strict --no-interactive`：`23/23` PASS。
- `pnpm dashboard:check`：PASS，生成物 current。
- `git diff --check`：PASS。
- 静态门禁：
  - `progressForSession()` 内无 `since()`；
  - production server 拥有 dispatcher；
  - claim SQL 在数据库层限定 trace/due；
  - production formal executor 无默认 cursor；
  - diff 未发现真实 `sk-*` 或长 Bearer credential。
- production-sized rehearsal：
  - schema versions `1,2`；
  - invalid non-trace pending/retry `0`；
  - non-trace `not_applicable = 1,762,162`；
  - trace pending `1,763,412`；
  - claim/dead-letter query plan 命中新 index；
  - `PRAGMA integrity_check = ok`；
  - 原始 main/WAL/SHM dev/ino/size/mtime/mode 全部未变化；
  - clone 已可恢复地移入当前用户 Trash。

## 最终建议

冻结当前源代码状态，下一步只创建并执行固定 60 分钟本地恢复回归：使用真实 Java Gateway、真实 production Runtime、固定 Gate D 60/20/15/5 workload、20 concurrency、10,000 scopes、30 秒 sampling；记录 admission、durable replay、formal-incremental oracle、Runtime RSS/FD/WAL、outbox backlog/dead-letter 和 Java log growth。不得在回归运行期间修改源码或重用历史 report。

若 60 分钟回归 PASS，再同步 Dashboard `verified`、补充 OpenSpec task 4.5/4.6 的本地证据边界和 closeout；4.2/4.3、生产晋升与 archive 仍必须等待正式 24 小时 Gate D 和 post-result human approval。

## 后续门禁

- **OpenSpec proposal：** 不需要新增；继续使用 active change `harden-agent-runtime-single-node-production`。
- **Superpowers plan：** 必须为 60 分钟恢复回归另建固定、no-overwrite、可审计执行计划与 preflight Review。
- **Dashboard：** 当前不修改；60 分钟本地正式回归通过后才进入 `verified` 同步判断。
- **24 小时 Gate D：** 未执行、未通过、未授权结果晋升。
- **OpenSpec archive：** 不允许。
- **Git：** 未 commit、push、merge 或 tag。
- **项目规则：** 未修改。
