# Agent Runtime Main Stream Admission Recovery Implementation Review

## 结论

通过：main stream admission 已收敛为“execution 已创建/生产模式已提交 durable start 后显式 flush headers”，buffered drain 只读取当前 execution；完整 session cursor replay 未变。允许执行下一次成熟数据库 10 分钟短回归，但不授权 Attempt005、正式 Gate D 或 production promotion。

## Review 范围

- [AgentStreamLoop 实现](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- [AgentStreamLoop counting test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/agentStreamLoop.test.ts)
- [Abort API 时序测试](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/abortApi.test.ts)
- [Detached stream 时序测试](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/detachedStream.test.ts)
- [Session events API](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-stream-admission-recovery.md)
- [Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-stream-admission-recovery-plan-review.md)

## 主要发现

### Critical / High

无。

### Medium

1. `runner.start(input)` 现在先于 `writeHead(200)`；生产 persistence 的 execution/start lifecycle commit 完成后，客户端才可能观察到成功 admission。
2. `flushHeaders()` 紧跟 SSE headers；header flush 与后续 subscribe/drain 之间没有 `await`，不会产生 JS 事件循环插入窗口。
3. subscribe 仍先于 buffered drain；drain 改用 `forExecution(tenantId,userId,conversationId,handle.executionId)`，不再读取或 JSON decode 历史 executions。
4. [Session events API](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts) 仍使用完整 `since()` cursor replay；本切片未改变 reconnect、gap detection 或跨 scope 语义。

### Low

1. counting RED 精确观察到旧顺序 `writeHead → start`，并在第一条断言失败；GREEN 证明 `start → writeHead → flushHeaders → current-execution write`、`sinceCalls = 0`、`forExecutionCalls = 1`。
2. 首次全量测试时，两个使用固定 `100/600/700ms` sleep 的真实网络测试在并发负载下失败；单独复跑通过，证明不是功能回归。测试已改为等待 durable `agent_start`、`stream_error`、`stream_done`，最终全套稳定通过。
3. 独立 production probe 使用真实临时 SQLite、production server、双 execution 与 `150ms` fake model：
   - header admission `19.769ms` / `2.844ms`，均早于 model completion；
   - 每条 main stream 恰好 12 个当前 execution events，第二条无历史 request/event；
   - session detail 4 条 stable messages、2 个 completed executions、每 execution 12 个 durable events；
   - cross-user GET `404`，`PRAGMA integrity_check = ok`，临时库/lock 已清理。
4. probe 的前两次 stdin 调用在服务启动前分别因 TypeScript stdin 语法和 root package resolution 失败；第一次实际服务探针因遗漏 GET 所需 trace/request identity 得到预期 `400`。修正调用契约后的最终 probe exit `0`；这些调用错误没有产生持久 evidence 或产品状态变化。

## 验证记录

- Targeted：5 files / 19 tests，PASS。
- Root test：
  - Shared schema：60 tests，PASS；
  - Agent Runtime：79 files / 645 tests，PASS；
  - Frontend：6 files / 24 tests，PASS；
  - Integration：5 files / 17 tests，PASS。
- Root typecheck：Shared schema、Agent Runtime、Frontend 全部 PASS。
- Java：213 tests，0 failures / 0 errors，BUILD SUCCESS。
- OpenSpec strict validate：PASS。
- Dashboard check：PASS，generated outputs current。
- `git diff --check`：PASS。
- 受影响 diff credential marker scan：PASS。
- Plan SHA-256：`85e55b2b4f4f8468cab0bd34b7f87b82b07ef74889b53331f37efc4596c1e026`。

## 最终建议

使用 fresh APFS clone、真实 Java、固定 MCP 与相同 10,000 scopes / concurrency 20 / workload / threshold / outbox / oracle，执行 10 分钟 20 样本回归。runner 必须从 [agent-runtime 工作目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/) 启动。

## 后续门禁

- 本 Review 没有修改项目规则、OpenSpec task 或 Dashboard。
- active OpenSpec change 仍为 `harden-agent-runtime-single-node-production`。
- 短回归必须继续使用原资格：admission median `<=100ms`、连续超限 `<=2`；replay median `<=250ms`、连续超限 `<=2`；相对 `182.760ms` 改善至少 30%，且 20/20 无 correctness/process/credential hard failure。
- 通过只授权 Attempt005 plan/preflight；失败则继续阻塞 Attempt005、正式 Gate D、production promotion 与归档。
