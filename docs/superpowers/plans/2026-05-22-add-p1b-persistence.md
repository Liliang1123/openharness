# Superpowers Plan: add-p1b-persistence

> Date: 2026-05-22
> Status: Approved
> Change: `openspec/changes/add-p1b-persistence`

## Steps

### Step 1: HistoryStore 接口 + InMemoryHistoryStore

File: `agent-runtime/src/history.ts`

- 定义 `HistoryStore` 接口
- 重构现有代码为 `InMemoryHistoryStore`
- 保留 `toModelMessages` 作为 `toApi` 视图

验证: `pnpm typecheck && pnpm test`

### Step 2: JsonFileHistoryStore

File: `agent-runtime/src/jsonFileHistoryStore.ts`

- `data/sessions/{tenantId}/{conversationId}.json`
- append → 内存 + 标记 dirty
- save → 写 JSON 文件
- load → 启动时从文件恢复
- 三种视图

验证: `pnpm typecheck`

### Step 3: Store 工厂 + 配置

File: `agent-runtime/src/historyFactory.ts`

- `HISTORY_STORE=memory|file` 环境变量
- `createHistoryStore()` 工厂函数
- server.ts 使用工厂

验证: `pnpm typecheck`

### Step 4: agentLoop 持久化时机

Files: `agent-runtime/src/agentLoop.ts`, `agentStreamLoop.ts`

- agent loop 完成后调 `store.save(tenantId, conversationId)`

验证: `pnpm typecheck && pnpm test`

### Step 5: estimateTokens + shouldCompress

File: `agent-runtime/src/compression.ts`

- `estimateTokens(messages)`: ASCII/4 + CJK/1.5
- `shouldCompress(messages, threshold=8000)`

验证: `pnpm typecheck`

### Step 6: compress 流程 + chunk 归档

File: `agent-runtime/src/compression.ts`

- `compress()`: 选旧消息 → 调 Java → 归档 chunk MD → 替换为 summary
- chunk 文件: `data/sessions/{tenantId}/{conversationId}-chunk-{N}.md`

验证: `pnpm typecheck`

### Step 7: Backend compress 端点

File: `backend/.../api/ModelController.java`

- `POST /api/v1/model/compress`
- 接收 messages，用 provider adapter 生成 summary
- 返回 `{ summary: "..." }`

验证: `mvn compile`

### Step 8: 单元测试

Files:
- `agent-runtime/test/jsonFileHistoryStore.test.ts`
- `agent-runtime/test/compression.test.ts`

验证: `pnpm test`

### Step 9: 集成验证

- 重启后 history 恢复
- 长对话触发压缩
- 压缩后仍能正常回答

验证: 端到端 curl

## Execution Mode

Inline sequential.
