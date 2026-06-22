# Superpowers Plan: add-p2b-session-list

> Date: 2026-05-25
> Status: Approved
> Change: `openspec/changes/add-p2b-session-list`

## Steps

### Step 1: HistoryStore 接口扩展

File: `agent-runtime/src/history.ts`

- 新增 type `SessionMeta { conversationId, title, updatedAt }`
- 接口新增 `list(tenantId): Promise<SessionMeta[]>` 和 `delete(tenantId, conversationId): Promise<void>`
- 新增辅助函数 `deriveTitle(messages): string`
- `InMemoryHistoryStore` 实现 list（遍历 Map，filter by tenant）和 delete（从 Map 删除）

验证: `pnpm typecheck`

### Step 2: JsonFileHistoryStore.list / delete

File: `agent-runtime/src/jsonFileHistoryStore.ts`

- `list(tenantId)`: `readdirSync({tenantId})` → 过滤 `.json` 且非 `-chunk-N.md` → 读 updatedAt 和首条 user message
- `delete(tenantId, conversationId)`:
  - 删除 `{conversationId}.json`
  - 删除 `{conversationId}-chunk-*.md`（glob）
  - 从内存 Map 移除
- 处理目录不存在的 case

验证: `pnpm typecheck`

### Step 3: Sessions API 端点

File: `agent-runtime/src/server.ts`

- `GET /api/v1/sessions` — 调 `history.list(tenantId)`，按 updatedAt 降序
- `GET /api/v1/sessions/:conversationId` — 调 `history.get` + `toApi`，404 if empty
- `DELETE /api/v1/sessions/:conversationId` — 调 `history.delete`，幂等返回 204

验证: `pnpm typecheck`

### Step 4: Frontend api.ts

File: `frontend/src/api.ts`

- 新增 `SessionMeta` 类型
- 新增 `listSessions / getSession / deleteSession` 函数

验证: `pnpm typecheck`

### Step 5: SessionList 组件

File: `frontend/src/SessionList.tsx`

- Props: `sessions, activeId, onSelect, onNew, onDelete`
- 渲染列表、新建按钮、每项 hover 时显示删除按钮 + confirm
- 简单 CSS 类

验证: `pnpm typecheck`

### Step 6: App.tsx 集成

File: `frontend/src/App.tsx`, `frontend/src/App.css`

- state: `sessions`, `activeConversationId`, `messages`
- mount 时 `listSessions`
- 切换 active session 时 `getSession` → 重渲染 messages
- 新建：生成新 conversationId，清空 messages，加入列表（first message 后服务端会持久化）
- 删除：confirm → `deleteSession` → reload list
- 收到 final_answer 后刷新 list（更新 title / updatedAt）

验证: `pnpm typecheck`

### Step 7: 单元测试 — agent-runtime

File: `agent-runtime/test/sessionsApi.test.ts`

- 测试 GET /sessions list
- 测试 GET /sessions/:id 404 + 200
- 测试 DELETE 删除文件
- 测试 tenant 隔离

File: `agent-runtime/test/jsonFileHistoryStore.test.ts` (扩展)

- 测试 list 扫描目录
- 测试 delete 删除主文件 + chunk 文件

验证: `pnpm test`

### Step 8: Frontend 测试

File: `frontend/test/SessionList.test.tsx`

- 测试 list 渲染
- 测试 click 切换
- 测试 new 按钮
- 测试 delete confirm

验证: `pnpm test`

### Step 9: E2E 验证

- 启动 backend + agent-runtime + frontend
- 浏览器：新建会话 → 发消息 → 刷新 → 切换 → 删除

验证: 手动观察

## Execution Mode

Inline sequential.
