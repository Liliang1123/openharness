## 1. Agent-runtime — History 接口化 + JSON 文件持久化
- [x] 1.1 定义 `HistoryStore` 接口：`append`, `get`, `replace`, `save`, `load`
- [x] 1.2 重构现有 `MessageHistoryStore` 为 `InMemoryHistoryStore` 实现接口
- [x] 1.3 实现 `JsonFileHistoryStore`：JSON 文件存储，路径 `data/sessions/{tenantId}/{conversationId}.json`
- [x] 1.4 配置切换：环境变量 `HISTORY_STORE=memory|file`，默认 file
- [x] 1.5 三种视图：`toApi`（剥离 internal）、`toPersisted`（全量）、`toReplay`（跳过 transient）
- [x] 1.6 持久化时机：agent loop 完成后自动 save

## 2. Agent-runtime — Insert-then-Compress
- [x] 2.1 `estimateTokens(messages)` 函数（ASCII ~4 chars/token，CJK ~1.5）
- [x] 2.2 `shouldCompress(messages, threshold)` 判断
- [x] 2.3 `compress(messages, javaClient, headers)` 流程：
  - 选择旧消息（保留最近 KEEP_RECENT_MESSAGES 条）
  - 调 Java `POST /api/v1/model/compress` 生成 summary
  - 归档旧消息为 `{conversationId}-chunk-{N}.md`
  - summary 作为 `role: "user"`, `compressedSummary: true`, `chunkPath: ...` 替换
- [x] 2.4 压缩后重新计算 `cacheHints`
- [x] 2.5 agentLoop 中在 final answer 前检查并触发压缩

## 3. Backend — Compress 端点
- [x] 3.1 `POST /api/v1/model/compress`：接收 messages，用 provider adapter 生成 summary
- [x] 3.2 返回 `{ summary: "..." }`

## 4. Tests
- [x] 4.1 Agent-runtime 单元测试：JsonFileHistoryStore CRUD + 三种视图
- [x] 4.2 Agent-runtime 单元测试：estimateTokens + compression 逻辑（mock javaClient）
- [x] 4.3 Backend 单元测试：compress 端点
- [x] 4.4 集成测试：长对话触发压缩后仍能正常回答
- [x] 4.5 集成测试：进程重启后 history 恢复
