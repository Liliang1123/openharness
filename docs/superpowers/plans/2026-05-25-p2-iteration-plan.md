# P2 Iteration Plan

> Date: 2026-05-25
> Status: Draft
> Scope: 三个独立 change，可并行或顺序推进

## 背景

P0a（骨架）、P0b（hookable SSE）、P1a（provider adapter）、P1b（persistence + compression）均已完成。
根据 project.md 排除列表和架构合约，P2 聚焦以下三个方向：

---

## Change 1: `add-p2a-mcp` — MCP Tool 集成

**目标**：TS Agent Runtime 支持通过 MCP (Model Context Protocol) 动态注册外部工具服务器。

### 核心设计
- TS Runtime 新增 `McpRegistry`：管理 MCP server 连接（stdio / HTTP SSE）
- MCP tools 注入 ToolRegistry，与 Java catalog tools 合并后发给模型
- 工具执行路径：MCP tools 由 TS Runtime 直接调用 MCP server（不经 Java executeTool）
- Policy 仍走 Java `beforeToolUse` hook — MCP tools 也受 policy 管控
- 配置：`mcp.json` 文件定义 server 列表

### 关键约束
- MCP tool 执行不经 Java（Java 不持有 MCP server 连接）
- Policy evaluate 仍经 Java（MCP tool 也需要 policy 审批）
- MCP tool result 进入 history，与 catalog tool result 同等对待

### 预估 Steps
1. MCP client 库（stdio + HTTP SSE transport）
2. McpRegistry：加载 mcp.json，连接 server，获取 tool list
3. ToolRegistry 合并：catalog tools + MCP tools
4. agentLoop 执行分流：catalog tool → Java，MCP tool → MCP server
5. beforeToolUse 统一覆盖 MCP tools
6. 单元测试 + 集成测试

---

## Change 2: `add-p2b-session-list` — Frontend 会话列表

**目标**：Frontend 支持多会话管理（列表、新建、切换、删除）。

### 核心设计
- TS Runtime 新增 `GET /api/v1/sessions?tenantId=X` — 返回会话列表（从 data/sessions 目录扫描）
- TS Runtime 新增 `DELETE /api/v1/sessions/:conversationId` — 删除会话文件
- Frontend 左侧栏展示会话列表，支持新建 / 切换 / 删除
- 会话标题：取第一条 user message 前 30 字符

### 关键约束
- Frontend 只调 TS Runtime，不直接读文件系统
- 删除会话同时清理 chunk 文件

### 预估 Steps
1. TS Runtime sessions API（list + delete）
2. Frontend 会话列表组件
3. Frontend 路由：conversationId 作为 URL 参数
4. 新建会话 + 切换逻辑
5. 测试

---

## Change 3: `add-p2c-auto-compress` — 自动压缩触发

**目标**：agentLoop 在每次 final answer 前自动检查 token 阈值并触发压缩。

### 核心设计
- agentLoop / agentStreamLoop 在 save 前调用 `shouldCompress` → `compress`
- 压缩后重新计算 cacheHints
- 可配置：`COMPRESSION_AUTO=true|false`（默认 true）

### 关键约束
- 压缩失败不阻塞响应（catch + log）
- 压缩是异步的，不影响用户感知延迟（在 response 发出后执行）

### 预估 Steps
1. agentLoop 加入 auto-compress 逻辑
2. agentStreamLoop 同步加入
3. 错误处理 + 配置开关
4. 集成测试：长对话自动触发压缩

---

## 推荐执行顺序

1. **P2c（auto-compress）** — 最小改动，补全 P1b 的最后一环
2. **P2b（session-list）** — 用户体验提升，独立于其他功能
3. **P2a（MCP）** — 最复杂，架构影响最大

## 下一步

选择一个 change 开始，我会创建对应的 `openspec/changes/` proposal + design + specs + plan。
