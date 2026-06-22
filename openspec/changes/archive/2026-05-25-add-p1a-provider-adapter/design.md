## Context
P0a/P0b 使用硬编码 SenseNova 调用。P1a 需要正式的 provider 抽象，支持多 provider 并行配置和运行时路由，同时实现 cache hints 跨边界协议。

## Goals
- 多 provider 支持（OpenAI-compatible、Anthropic），通过配置切换
- Cache hints 由 TS 生成、Java 渲染，实现近 100% cache hit
- Provider 故障时结构化重试和降级

## Non-Goals
- Provider key rotation / vault 集成（P2）
- 流式 provider 响应（当前 P1a 仍用同步，P1b compression 时再加）
- 多 provider fallback chain（P1c）

## Decisions

### Provider Adapter 接口设计
```java
public interface ProviderAdapter {
  ModelChatResponse chat(ModelChatRequest request, ProviderConfig config);
  String providerType(); // "openai-compatible" | "anthropic"
}
```
- 每个 adapter 是无状态 Spring Bean
- `ModelController` 根据 model name → provider config 映射选择 adapter
- Provider config 从 `application.yml` 加载

### 配置结构
```yaml
openharness:
  providers:
    - name: sensenova
      type: openai-compatible
      base-url: https://token.sensenova.cn/v1
      api-key: ${SENSENOVA_API_KEY}
      models: [sensenova-6.7-flash-lite]
    - name: anthropic
      type: anthropic
      base-url: https://api.anthropic.com
      api-key: ${ANTHROPIC_API_KEY}
      models: [claude-sonnet-4-20250514, claude-haiku]
  default-provider: sensenova
```

### Cache Hints 协议
- TS 计算 `cacheHints: [{messageIndexFromTail: 1, scope: "message"}, {messageIndexFromTail: 3, scope: "tool_result_block"}]`
- Java Anthropic adapter 将 `messageIndexFromTail` 转为从尾部数的 message index，在对应位置插入 `cache_control`
- OpenAI-compatible adapter 忽略 cacheHints

### 重试策略
- 仅对 HTTP 503 重试，最多 3 次
- 退避：200ms → 400ms → 800ms
- 超过重试次数返回 `PROVIDER_UNAVAILABLE` 结构化 error

## Risks / Trade-offs
- Anthropic adapter 需要完全不同的请求格式（Messages API vs Chat Completions）——通过独立 adapter 隔离
- 当前无 Anthropic API key 可测试——使用 mock HTTP fixture 验证格式转换

## Open Questions
- 无阻塞项
