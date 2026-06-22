## 1. Dependencies & Config
- [x] 1.1 添加 `@modelcontextprotocol/sdk` 依赖到 `agent-runtime/package.json`
- [x] 1.2 定义 `McpConfig` 类型和 `mcp.json` schema
- [x] 1.3 实现 `loadMcpConfig()`：优先 project root，回退 agent-runtime/

## 2. McpRegistry
- [x] 2.1 `mcpRegistry.ts`：spawn server + initialize + tools/list
- [x] 2.2 `execute(serverName, toolName, args)`：调 tools/call、转换错误
- [x] 2.3 `listTools()` / `refreshToolDefinitions()`：返回所有可用 MCP tools
- [x] 2.4 `shutdown()`：kill 所有子进程
- [x] 2.5 失败处理：启动失败 / 调用超时 / 进程 crash

## 3. ToolRegistry 合并
- [x] 3.1 `toolRegistry.ts`：合并 catalog + MCP tools，catalog 优先
- [x] 3.2 `resolveSource(toolName)`：返回 "catalog" 或 "mcp:{server}"
- [x] 3.3 `getSources()` 暴露完整映射
- [x] 3.4 给模型时不暴露 internal source 标记

## 4. agentLoop 路由
- [x] 4.1 `agentLoop.ts`：执行工具时按 source 分流
- [x] 4.2 `agentStreamLoop.ts`：同步加入
- [x] 4.3 MCP 调用结果适配为 `ToolCallResponse` 形状（含 status/result/error）

## 5. Server 集成
- [x] 5.1 `server.ts`：startup 时 init McpRegistry，shutdown 时 cleanup
- [x] 5.2 注入 McpRegistry 到 ToolRegistry / agentLoop / agentStreamLoop

## 6. 安全 opt-in
- [x] 6.1 `MCP_REQUIRE_APPROVAL=true` 时，TS 端将 MCP tool 强制升级为 REQUIRE_APPROVAL

## 7. Tests
- [x] 7.1 单元测试：`McpRegistry`（loadMcpConfig + 失败隔离，8 tests）
- [x] 7.2 单元测试：`ToolRegistry` 合并 + 冲突 + sources（5 tests）
- [x] 7.3 单元测试：agentLoop 路由分流（3 tests）
- [x] 7.4 单元测试：`MCP_REQUIRE_APPROVAL` opt-in（3 tests）

## 8. Documentation
- [x] 8.1 `agent-runtime/README.md`：mcp.json 示例 + known-limitation 说明 + opt-in 用法

## 9. Verification
- [x] 9.1 `pnpm typecheck` 通过
- [x] 9.2 `pnpm test` 全部通过（agent-runtime: 60 tests, frontend: 9 tests）
- [x] 9.3 手动 E2E：用 `@modelcontextprotocol/server-everything` 验证（mcp.json 加载、stdio 子进程启动、catalog 合并、shutdown kill 子进程；2026-05-25 curl 验证，详见 docs/architecture/dev_runbook.md）
