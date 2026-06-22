## 1. Backend — Provider Adapter 抽象
- [x] 1.1 定义 `ProviderAdapter` 接口：`chat(request, providerConfig) -> ProviderResponse`
- [x] 1.2 实现 `OpenAiCompatibleAdapter`（覆盖 SenseNova / DeepSeek / OpenAI / 任意兼容端点）
- [x] 1.3 实现 `AnthropicAdapter`（Anthropic Messages API，支持 `cache_control` hoist）
- [x] 1.4 Provider 配置：`application.yml` 支持多 provider 定义，按 model name 路由
- [x] 1.5 Provider 503 重试：最多 3 次，返回结构化 error（errorClass=PROVIDER_UNAVAILABLE）
- [x] 1.6 Usage/cost 字段回传：`ModelChatResponse.usage` 填充真实 token 数

## 2. Backend — Cache Hints 渲染
- [x] 2.1 `ModelChatRequest.meta.cacheHints` 解析
- [x] 2.2 Anthropic adapter：将 `cacheHints[].messageIndexFromTail` 转为对应 message 的 `cache_control: {type: "ephemeral"}`
- [x] 2.3 OpenAI-compatible adapter：忽略 cacheHints（provider 不支持）

## 3. Agent-runtime — Cache Hints 生成
- [x] 3.1 `computeCacheHints(messages)` 函数：跳过 systemInjected/transient/compressionInstruction，选最后 2 个非跳过 message 的 index
- [x] 3.2 agentLoop / agentStreamLoop 在 chat 请求中填充 `meta.cacheHints`
- [x] 3.3 Trace event 记录 usage（promptTokens/completionTokens/costUsdMicros）

## 4. Tests
- [x] 4.1 Backend 单元测试：MockModelService 作为 ProviderAdapter，10 tests passed
- [x] 4.2 Backend：503 重试逻辑在 adapter 中实现（ProviderUnavailableException）
- [x] 4.3 Agent-runtime 单元测试：computeCacheHints 5 tests passed
- [x] 4.4 集成测试：真实 SenseNova 端到端（model→tool→final 验证通过）
- [x] 4.5 集成测试：cacheHints 在 request meta 中正确传递
