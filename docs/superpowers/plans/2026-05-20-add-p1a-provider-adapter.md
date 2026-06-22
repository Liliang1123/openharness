# Superpowers Plan: add-p1a-provider-adapter

> Date: 2026-05-20
> Status: Approved
> Change: `openspec/changes/add-p1a-provider-adapter`

## Steps

### Step 1: ProviderAdapter 接口 + ProviderConfig

Files:
- `backend/src/main/java/org/openharness/backend/service/provider/ProviderAdapter.java`
- `backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java`
- `backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java`

验证: `mvn compile`

### Step 2: OpenAiCompatibleAdapter

File: `backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java`

- 从现有 `SenseNovaModelService` 提取通用逻辑
- 支持任意 base-url + api-key
- 503 重试 3 次（200/400/800ms）
- 忽略 cacheHints

验证: `mvn compile`

### Step 3: AnthropicAdapter

File: `backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java`

- Anthropic Messages API 格式转换
- `meta.cacheHints` → `cache_control: {"type":"ephemeral"}` hoist
- tool_calls 格式：Anthropic `tool_use` content block
- 503 重试同上

验证: `mvn compile`

### Step 4: Provider 配置 + ModelController 重构

Files:
- `backend/src/main/resources/application.yml` (多 provider 配置)
- `backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java`
- `backend/src/main/java/org/openharness/backend/api/ModelController.java` (路由到 adapter)

- 删除旧 `SenseNovaModelService`
- ModelController 按 model name 查 registry → adapter.chat()

验证: `mvn compile`

### Step 5: Agent-runtime — computeCacheHints

File: `agent-runtime/src/cacheHints.ts`

- `computeCacheHints(messages): CacheHint[]`
- 跳过 systemInjected/transient/compressionInstruction
- 选最后 2 个 eligible message 的 messageIndexFromTail
- agentLoop + agentStreamLoop 填充 `meta.cacheHints`

验证: `pnpm typecheck && pnpm test`

### Step 6: Backend 单元测试

Files:
- `backend/src/test/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapterTest.java`
- `backend/src/test/java/org/openharness/backend/service/provider/AnthropicAdapterTest.java`

- Mock HTTP 验证请求格式
- 503 重试验证
- cacheHints 渲染验证

验证: `mvn test`

### Step 7: Agent-runtime 单元测试

File: `agent-runtime/test/cacheHints.test.ts`

- 正常 conversation → 2 hints
- transient message 跳过
- 少于 2 eligible → 返回可用数量

验证: `pnpm test`

### Step 8: 集成验证

- 重启 backend + agent-runtime
- 端到端 SenseNova 调用确认不回归
- cacheHints 在 request 中正确传递（通过 trace 或 log 验证）

验证: `curl` 端到端 + integration test

## Execution Mode

Inline sequential.
