## 1. Agent-runtime — HistoryStore 接口扩展
- [x] 1.1 在 `HistoryStore` 接口新增 `list(tenantId)` 和 `delete(tenantId, conversationId)`
- [x] 1.2 `InMemoryHistoryStore` 实现：从 Map 索引列出 / 删除
- [x] 1.3 `JsonFileHistoryStore` 实现：扫描目录列出，删除文件 + chunk 文件

## 2. Agent-runtime — Sessions API
- [x] 2.1 `GET /api/v1/sessions` — 返回 `SessionMeta[]`（id, title, updatedAt）
- [x] 2.2 `GET /api/v1/sessions/:conversationId` — 返回 messages（toApi 视图）
- [x] 2.3 `DELETE /api/v1/sessions/:conversationId` — 删除 session

## 3. Frontend — Session List UI
- [x] 3.1 `api.ts` 新增 `listSessions / getSession / deleteSession`
- [x] 3.2 `SessionList.tsx` 组件：列表 + 新建 + 删除按钮
- [x] 3.3 `App.tsx`：active session state、切换时加载历史 messages、新建按钮
- [x] 3.4 CSS：左侧栏布局

## 4. Tests
- [x] 4.1 单元测试：JsonFileHistoryStore.list / delete（5 个新测试）
- [x] 4.2 单元测试：sessions API 端点（sessionsApi.test.ts，7 tests）
- [x] 4.3 Frontend 测试：SessionList 组件（SessionList.test.tsx，7 tests）

## 5. Verification
- [x] 5.1 `pnpm typecheck` 通过（agent-runtime + frontend）
- [x] 5.2 `pnpm test` 通过（agent-runtime: 41 tests, frontend: 9 tests）
- [x] 5.3 手动 E2E：list / get / delete / 404 / 幂等 / tenant 隔离（curl 验证 2026-05-25，详见 docs/architecture/dev_runbook.md）
