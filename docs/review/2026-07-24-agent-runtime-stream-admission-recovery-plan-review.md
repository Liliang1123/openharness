# Agent Runtime Main Stream Admission Recovery Plan Review

## 结论

通过：方案严格限制在 main stream admission/replay 内部边界，直接对应 Attempt002 的剩余延迟证据；可以按 RED→GREEN 串行实施。

## Review 范围

- [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-stream-admission-recovery.md)
- [Attempt002 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-002-result-review.md)
- [AgentStreamLoop](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- [Runtime event store contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- [Session events API](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)

## 主要发现

### Critical / High

无。

### Medium

1. header flush 必须发生在 `runner.start()` 返回后，避免在 durable execution 尚未创建时向客户端声明 admission 成功。
2. subscribe 必须继续先于 current-execution drain，依赖 JS 同线程无插入窗口，避免同步 buffered event 与后续 live event 之间出现 gap。
3. main stream 改用 `forExecution` 不得扩散到 session events SSE；后者的完整 tenant/user/conversation cursor replay 是独立规范要求。

### Low

1. 这是 active OpenSpec change 已批准性能/运行时语义的实现修正，不新增用户可见 API、schema 或治理边界。

## 最终建议

严格执行 counting store RED；GREEN 后先做 targeted + full verification 和业务探针，再决定是否允许新的成熟库短回归。禁止因为单元测试通过直接进入 Attempt005。

## 后续门禁

- 不修改项目规则。
- 不需要新增 OpenSpec proposal；继续受 active change 约束。
- 需要 Implementation Review、独立短回归结果 Review。
- 正式 24 小时 Gate D、production promotion、Dashboard verified 与归档仍阻塞。
