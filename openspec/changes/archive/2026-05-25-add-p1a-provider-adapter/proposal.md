# Change: Add P1a Provider Adapter + Cache Hints

## Why
P0b 使用 SenseNova 硬编码调用。P1a 需要正式的 provider adapter 抽象，支持多 provider 切换（OpenAI-compatible / Anthropic），实现 cache hints 跨边界协议，并在 trace 中落地 cost/token 字段。

## What Changes
- **Backend**: Provider adapter 抽象层（接口 + OpenAI-compatible 实现 + Anthropic 实现）；cache hints 渲染（Anthropic `cache_control` hoist）；provider 503 重试 3 次 + 结构化 error；usage/cost 字段回传
- **Agent-runtime**: TS 生成 `meta.cacheHints`（跳过 systemInjected/transient/compressionInstruction，输出 messageIndexFromTail）；trace 中记录 token/cost
- **Shared-schema**: 补充 `CacheHint` 相关 schema 验证测试

## Impact
- Affected specs: 新增 `provider-adapter`、`cache-hints` capabilities
- Affected code:
  - `backend/src/main/java/org/openharness/backend/service/` (新增 ProviderAdapter 接口 + 实现)
  - `backend/src/main/java/org/openharness/backend/api/ModelController.java`
  - `agent-runtime/src/agentLoop.ts` / `agentStreamLoop.ts` (cacheHints 生成)
  - `agent-runtime/src/javaClient.ts` (usage 解析)

## Non-Goals
- 不做 MessageHistory 持久化（P1b scope）
- 不做 compression（P1b scope）
- 不做 MCP / policy snapshot（P1c scope）
