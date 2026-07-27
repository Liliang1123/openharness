# Agent Runtime 10 分钟成熟数据库回归 Attempt002 Result Review

## 结论

需修改：Attempt002 自然完成 20/20 样本，正确性、replay、资源、outbox、SQLite 完整性、credential 与进程清理全部通过；但 admission p95 median 为 `137.242ms`，20 个样本连续高于 `100ms`，且相对 Attempt004 末四分位只改善 `24.906%`，未达到既定准入条件。禁止进入 Attempt005。

## Review 范围

- [Attempt002 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-002/gate-r5-20260724-mature-002-report.json)
- [Attempt002 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-002/gate-r5-20260724-mature-002-journal.jsonl)
- [Java Gateway 日志](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/java-gateway-18084.log)
- [Attempt002 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-002-preflight-review.md)
- [AgentStreamLoop](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- [Session API wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [Runtime event store contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- [读路径恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-read-path-contention-recovery.md)

## 主要发现

### High

1. admission p95：min `119.877ms`、median `137.242ms`、max `148.635ms`；20/20 样本高于 `100ms`。
2. report failure：
   - `SHORT_REGRESSION_ADMISSION_MEDIAN_EXCEEDED`
   - `SHORT_REGRESSION_ADMISSION_CONSECUTIVE_BREACH`
   - `SHORT_REGRESSION_IMPROVEMENT_INSUFFICIENT`
   - `SUSTAINED_THRESHOLD_BREACH(admissionP95Ms)`
3. 相对 Attempt004 末四分位 admission median `182.760ms` 改善 `24.906%`，低于预设 `30%`。

### Medium

1. replay p95：min `118.582ms`、median `136.153ms`、max `151.178ms`，0 个样本超过 `250ms`。
2. admission 与 replay 的样本相关系数为 `0.9917`；admission 与 backlog 相关系数为 `-0.0108`，与 oracle 为 `-0.3407`。当前延迟更符合共享 Node/SQLite 请求链成本，而不是 outbox 或 evidence oracle 拖慢。
3. admission 前 5 个样本 median `136.356ms`，后 5 个样本 median `140.945ms`，仅增长约 `3.36%`；数据库从 `4,092,854,272` 增至 `4,712,640,512` bytes，但没有重现 Attempt004 的线性后段恶化。此前 execution-scoped session projection 已有效移除成熟库读放大的一部分。
4. [AgentStreamLoop](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts) 在每次新 main stream admission 中仍调用完整 conversation `since(..., null)`，随后才按当前 `executionId` 过滤。该读取与 main stream 的实际语义不一致：main stream 只发送当前 execution；完整 conversation replay 应由 session events SSE 承担。
5. main stream 调用 `writeHead(200)` 后没有显式 `flushHeaders()`；native fetch 的 admission 观测会等待首个 SSE body，因此当前指标还包含 runner start 后的完整历史读取。正确的 durable admission 边界应在当前 execution 已创建并提交后显式 flush，再执行当前 execution 的 buffered-event drain。

### Low

1. 20 个 checkpoint 的 correctness/readiness/process hard failure 总数为 0。
2. RSS min/median/max：约 `276/417/587 MiB`；FD min/median/max：`89/100/116`；WAL max：`7,551,992` bytes。
3. outbox backlog min/median/max：`0/88/166`；最终 pending/retry/dead-letter 均为 0。
4. oracle duration min/median/max：`78.031/88.343/114.932ms`。
5. final `PRAGMA integrity_check = ok`；source/runner/plan/MCP binding 未漂移；report/journal/Java log credential negative scan 通过。
6. Runtime `3102`、Java `18084`、MCP fixture 进程均为 0；Attempt001 与 Attempt002 临时 clone 已按精确 prefix 删除。

## 最终建议

执行一个最小 TDD 切片：

1. main stream 在 `runner.start()` 返回、durable execution 已创建后显式 flush `200 text/event-stream` headers；
2. main stream 的 buffered drain 从完整 `since(..., null)` 改为 `forExecution(..., handle.executionId)`；
3. session events SSE 的完整 cursor replay 保持不变；
4. 用 counting store 测试证明 main stream 不调用 `since()`、只读取当前 execution，且 header flush 发生在 runner start 之后、buffer drain 之前；
5. 完成受影响测试、全量验证和独立 Review 后，再运行一次成熟库短回归；不得直接进入 Attempt005。

## 后续门禁

- active OpenSpec change 仍为 `harden-agent-runtime-single-node-production`。
- 本 Review 不修改项目规则、OpenSpec task、Dashboard 或生产状态。
- Attempt005、正式 24 小时 Gate D、production promotion、OpenSpec 归档全部继续阻塞。
- 新切片必须先落盘可执行 plan 与 plan Review，再按 RED→GREEN 实施；若短回归仍不满足原资格，停止进入新的根因诊断。
