# Proposal: add-p2b-session-list

## Summary

为 Frontend 增加多会话管理：列出 / 切换 / 删除 / 新建 session。

## Motivation

P1b 完成后，conversation history 已经持久化到磁盘，但 Frontend 每次刷新生成新 conversationId，无法访问历史会话。多会话管理是用户能感知到 P1b 价值的最小前端能力。

## Scope

**In scope**：
- TS Runtime 新增 `GET /api/v1/sessions` — 列出当前 tenant 的所有 session
- TS Runtime 新增 `GET /api/v1/sessions/:conversationId` — 获取单个 session 的消息历史
- TS Runtime 新增 `DELETE /api/v1/sessions/:conversationId` — 删除 session（含 chunk 文件）
- Frontend 左侧栏会话列表组件
- Frontend 切换 active session 加载历史消息
- Frontend "新建会话" 按钮

**Out of scope**：
- 会话搜索 / 筛选
- 会话标签 / 分组
- 会话重命名
- 跨 tenant 共享

## Design Decisions

1. **Session 列表来源**：扫描 `data/sessions/{tenantId}/` 目录下 `*.json` 文件（不读 chunk MD）。InMemoryHistoryStore 模式下返回内存中的 conversationId 列表。
2. **Session title 生成**：取 session 的首条 `role=user` 消息 content 前 30 字符。无 user 消息则显示 "New conversation"。
3. **删除语义**：删除 `{conversationId}.json` + 所有 `{conversationId}-chunk-*.md` 文件。InMemory 模式下从 Map 移除。
4. **HistoryStore 接口扩展**：新增 `list(tenantId): Promise<SessionMeta[]>` 和 `delete(tenantId, conversationId): Promise<void>`。
5. **Frontend 路由**：保持单页应用，`conversationId` 作为组件 state（不引入 router）。新建会话生成新 ID 并清空当前 messages。
6. **Active session 切换**：从后端拉取该 conversation 的 message 历史，渲染到 chat pane。

## Impact

- **TS Runtime**：HistoryStore 接口新增 2 方法、2 个 implementation 实现、server.ts 新增 3 个路由
- **Frontend**：新增 SessionList 组件、api.ts 新增 3 个函数、App.tsx 重构以支持 active session 切换
- **Backend**：无改动
- **Breaking changes**：HistoryStore 接口扩展（影响实现 mock 的测试），但语义向后兼容
- **Risk**：中 — 涉及前后端协同；删除操作不可逆需要确认
