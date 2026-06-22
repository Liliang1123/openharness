# Proposal: add-p2a-mcp

## Summary

让 TS Agent Runtime 通过 MCP (Model Context Protocol) 集成外部工具服务器，扩展可用工具集而不增加 Java backend 的工具注册负担。

## Motivation

当前所有工具都需要在 Java 端的 ToolCatalog 中注册和实现。要接入第三方工具（如文件系统、git、数据库 MCP server）成本高。MCP 是业界标准协议，集成后用户可以即插即用任何 MCP 兼容的工具服务器。

## Scope

**In scope**：
- TS Runtime 加载 `mcp.json` 配置，连接 MCP server（仅 stdio transport，HTTP 留作未来扩展）
- 启动时从每个 server 拉取 tool list，合并到模型可见的 tools
- agentLoop 执行工具时按 source 路由：`catalog` → Java，`mcp:{name}` → MCP server
- MCP tool 仍受 Java policy 管控（beforeToolUse hook 适用）
- MCP tool 的 history / trace 与 catalog tool 一致

**Out of scope（推到 P3 或更晚）**：
- HTTP/SSE transport
- MCP resources / prompts（只支持 tools）
- 动态运行时注册/卸载 MCP server
- MCP server 的 OAuth 流程
- 前端 MCP server 状态展示

## Key Design Decisions

### 1. MCP 客户端归属：TS Runtime
- TS Runtime 持有 MCP server 进程和 stdio 连接
- Java 不知道也不接触 MCP server
- 理由：避免 Java 持有跨语言子进程；保持 Java 作为"企业网关"角色专注于 model gateway / policy / catalog

### 2. Tool catalog 合并策略
- TS Runtime 每个 conversation 调 Java `GET /api/v1/tools/catalog` 获取 catalog tools
- TS Runtime 同时持有 MCP tools 列表（启动时缓存）
- 合并后发给模型；name 冲突时 catalog 优先（log warning）
- 给模型的每个 tool 加 `_source` 字段（仅 TS 内部用，不发模型）；外部协议层不暴露

### 3. catalogVersion / catalogHash 处理
- catalogVersion 和 catalogHash 由 Java 计算，仅覆盖 catalog tools
- MCP tools 不参与 catalogHash 计算
- agentLoop 在 freeze 时对 (catalogVersion, mcpServerVersions) 做组合标识，但传给 Java 的仍是原始 catalogVersion/Hash
- 理由：保持 P0a 契约不变，Java 依然只感知它的 catalog

### 4. Policy 评估
- 每个 MCP tool 在 catalog 视角下不存在；evaluatePolicy 收到 MCP tool 怎么处理？
- 决策：TS Runtime 仍调 Java evaluatePolicy，但请求里标记 `source: mcp`，由 Java 决定默认策略（建议默认 `REQUIRE_APPROVAL` for unknown tools）
- Java 端无需变更，只是收到的 toolName 可能不在它的 catalog 内 — 它已有"未知工具"分支会返回 deny / approval

### 5. 执行路由
- agentLoop 拿到 model 返回的 tool_call 后，根据 tool name 在内部路由表查 source
- catalog tool → 调 Java `/api/v1/tools/execute`
- MCP tool → 调 McpRegistry.executeTool(toolName, args)，结果转换为 ToolCallResponse 形状

### 6. 配置文件位置
- `agent-runtime/mcp.json`（项目根级 `mcp.json` 也支持，project root 优先）
- 格式参考 Claude Desktop / VSCode：`{"mcpServers": {"name": {"command": "...", "args": [...], "env": {...}}}}`

### 7. 失败处理
- MCP server 启动失败：log error，不阻塞 runtime 启动；该 server 的 tools 不可见
- MCP tool 执行失败：返回结构化错误（与 Java executeTool 错误形状对齐），写入 history 和 trace
- MCP server 进程 crash：标记不可用，再次调用返回 "MCP_SERVER_UNAVAILABLE" 错误

## Impact

**TS Runtime**：
- 新增 `mcpClient.ts`（stdio JSON-RPC 客户端）
- 新增 `mcpRegistry.ts`（管理 server 进程 + tool 索引 + 路由）
- 修改 `toolRegistry.ts`：合并 catalog + MCP tools
- 修改 `agentLoop.ts` / `agentStreamLoop.ts`：执行时路由
- 新增 `mcp.json` config + 解析

**Java Backend**：无改动（policy 评估对 MCP 工具仍走标准流程）

**Frontend**：无改动（MCP 工具对前端透明）

**Risk**：高
- 子进程管理（启动/关闭/僵尸进程）
- 跨进程 stdio 协议解析（消息边界、错误恢复）
- Policy 边界依赖 Java 对未知 tool 的处理（需要 verify）

## Open Questions for Approval

请你在批准前明确：

1. **stdio 是否够用**？还是必须同时支持 HTTP？建议：先 stdio，HTTP 留 P3。
2. **配置文件位置**：`agent-runtime/mcp.json` 还是项目根 `mcp.json`？建议：两者皆可，root 优先。
3. **Tool name 冲突策略**：catalog 优先（建议）还是 MCP 优先？
4. **未知 tool policy**：是否需要先在 Java 端确认对未知 tool 名是否会安全处理（默认 deny）？如果不确定，本次先把 MCP tools 元数据**也注册到 Java catalog**（dummy 占位），让 Java 视角和 TS 视角一致 — 但这违反"Java 不知道 MCP"的设计。建议接受 Open Question 5 处理。
5. **Java catalog 注入 vs TS 路由表**：方案 A — 仅 TS 路由（更干净，但 policy 看到未知 tool）；方案 B — TS 把 MCP tools 通过 `POST /tools/catalog/extra` 注入 Java（需要 Java 改造）。建议先 A。
