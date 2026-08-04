# Runtime Chat Lifecycle Logs Proposal Review

## 结论

通过：`add-runtime-chat-lifecycle-logs` 将当前 Local CLI 唯一失败项收敛为共享 execution runner 上的脱敏 accepted/terminal JSON-lines 投影。方案能让现有 `openharness logs runtime` 按 conversation/request/trace/execution 标识定位 chat，同时不改变 wrapper 命令、HTTP/SSE、RuntimeEventStore、trace outbox、数据库、Java Backend、provider、Frontend 或凭据边界。OpenSpec strict validation 已通过；当前只允许请求实施批准，不允许提前生成计划或修改 Runtime。

## Review 范围

- Gate 0 与领域术语：[CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/CONTEXT.md)
- Proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/proposal.md)
- Design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/design.md)
- Tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/tasks.md)
- Spec delta：[agent-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/specs/agent-runtime/spec.md)
- 当前 Runtime contract：[agent-runtime spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/specs/agent-runtime/spec.md)
- 生产入口事实：[server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- 共享 execution owner：[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
- Stream adapter：[agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentStreamLoop.ts)
- 现有 wrapper：[openharness](file:///Users/elvis/.local/bin/openharness)
- 失败证据与上一轮实施 Review：[2026-07-28-codex-reasoning-effort-implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-28-codex-reasoning-effort-implementation-review.md)

## 主要发现

### 高：敏感内容边界已显式收紧

Proposal 不启用通用 Fastify request logging，也不 spread request、execution state、error 或 metadata。accepted/terminal 记录采用固定字段 allowlist，并以负向 canary 测试禁止消息、回答、prompt、reasoning、工具数据、headers、tenant/user、Authorization、service token、provider key、OAuth 与任意异常文本。

### 中：共享 runner 是覆盖 sync/stream 的正确边界

同步和流式 chat 都调用同一个 `AgentExecutionRunner.start`，而 runner 同时拥有 execution identity、admission 与 terminal state。把投影放在该边界可避免两个 HTTP handler 各自实现、避免 client disconnect 丢失 terminal 记录，也不把生命周期权威转移给 wrapper 或 gateway。

### 中：日志明确不是持久化或 trace 权威

新术语 `Runtime Chat Lifecycle Log` 已加入领域词汇表。Design 明确 stdout 只是 operator diagnostic projection，不替代 RuntimeEventStore、durable events、trace ingestion、SQLite 或 audit evidence；sink/serialization failure 不得改变 agent execution。

### 中：验收能关闭当前 5/6 缺口

实施后的正式 smoke 必须在真实 chat 成功后，从 Runtime 日志中找到同一 conversation/request/trace 标识，再执行安全停机并确认 `8080`、`3001`、`3101`、`5173` 关闭。仅“tail 命令能运行”仍不足以判定 `logs` PASS。

### 低：两个 active change 不发生实现冲突

`add-codex-reasoning-effort-config` 的实现范围位于 Java provider 边界；本 proposal 的预期范围位于 TS Runtime execution/logging 边界。两者共同参与最终本地 smoke，但不修改同一生产源文件。本轮不归档任一 change。

## 验证记录

- `openspec validate add-runtime-chat-lifecycle-logs --strict --no-interactive`：PASS，退出码 0。
- Delta 解析：1 条 `agent-runtime` ADDED requirement、4 个 scenarios。
- Proposal/design/tasks 占位符与未授权 Git 命令扫描：0 命中。
- Dashboard render：PASS，38 entries。
- `git diff --check`：PASS。
- OpenSpec 的 PostHog 网络刷新 warning：非阻塞；contract validation 已先输出 valid 且最终退出码为 0。

## 最终建议

批准 `add-runtime-chat-lifecycle-logs` 后，再生成一次性 Superpowers implementation plan。计划应限制在小型 lifecycle logger、shared runner wiring、server test seam、定向 Runtime tests、wrapper guide、经备份的用户本地隔离源码同步和六命令 smoke；不得顺带启用通用 request logging、增加 CLI/API/数据库/Frontend 能力或记录请求内容。

## 后续门禁

- 当前 proposal：已通过设计与 proposal Review，但尚未获得针对 change-id 的实施批准。
- 下一门禁：用户明确批准 `add-runtime-chat-lifecycle-logs` 实施。
- 批准后：生成 Superpowers implementation plan，并先完成 Plan Preflight Review。
- Preflight PASS 后：按 TDD 实施、定向验证、独立 implementation Review 和真实六命令 smoke。
- 禁止事项：提前实现、Frontend 开发、全仓回归、OpenSpec archive、24 小时 Gate、commit、push、reset、clean。
- 项目规则：未修改。
