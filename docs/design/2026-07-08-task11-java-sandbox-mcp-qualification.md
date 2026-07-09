# Task 11 Java Sandbox / MCP Qualification Design Closeout

- 文档类型：设计收口 / Bug 分析 / 本地资格验证记录
- 日志及版本：2026-07-08 v1.0，记录 Task 11 本地 Java sandbox 与 MCP qualification preflight 的实现决策、修复点与剩余门禁

## 结论

通过：Task 11 的本地 Java sandbox 与真实 MCP stdio 子进程资格链路已按 `local_verified` 轨道打通。该结论仅适用于本地开发生命周期，不关闭 Gate B，不等价于生产资格，不授权生产 SQLite 写入或真实 Provider credential。

## 核心设计

1. Java sandbox 继续由 Spring Boot `ToolExecutionService` 承担，保持 workspace containment、allow-list command、policy、idempotency 和 backend audit 入口集中在 Java 侧。
2. `run_command` 增加请求级 `timeoutMs`、主动取消 endpoint 和 stdout/stderr 截断标记，避免将 timeout/cancel 仅作为测试假象。
3. MCP qualification 使用真实 stdio fixture subprocess，不 mock MCP client；`McpRegistry.execute` 直接使用 SDK `callTool` 的 timeout 和 `AbortSignal`，并把 MCP 工具结果固定标记为 `untrusted` provenance。
4. Qualification report schema 仍由 TS shared schema 约束，Task 11 仅输出 `track=local` / `result=local_verified` 的本地证据。

## 修复点

- Java sandbox：新增 `/api/v1/tools/cancel`，通过 `requestId + toolCallId` 定位并终止活跃 `Process`。
- Java sandbox：`run_command` 支持 bounded `timeoutMs`，超时返回 `TOOL_TIMEOUT`，取消返回 `TOOL_CANCELLED`。
- Java sandbox：stdout/stderr 使用 4096 字符上限并传播 `truncated=true`。
- Java sandbox：工具失败路径同样记录 `TOOL_CALL_END`，补齐 audit evidence。
- MCP：成功结果增加 `provenance="untrusted"`，取消映射到 `MCP_TOOL_CANCELLED`，超时映射到 `MCP_TOOL_TIMEOUT`。
- MCP fixture：新增真实 stdio qualification server，覆盖正常、多步、慢调用、冲突工具和 crash-on-call 隔离。

## 验证摘要

- [Task 11 verification report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/tools/task11-java-sandbox-mcp-local.md)
- 后端全量：`mvn -f backend/pom.xml test`，45 tests passed。
- Runtime 全量：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test`，59 files / 294 tests passed。
- Shared schema：`/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test`，48 tests passed。
- 根级类型检查：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck`，shared-schema / agent-runtime / frontend 均通过。

## 待办 / 门禁

- Gate B 仍需生产 backup/import/quarantine/restore/RPO/RTO 证据后人工关闭。
- Gate C 真实 Provider credential 不在本次范围；本次 MCP/Java 仅为本地真实进程链路。
- Task 12 才进入 deterministic short baseline；不得把本地 preflight 记为 formal 24h soak。
