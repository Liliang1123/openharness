# Change: add-p3b-cost-and-router

## Why

当前 Java `ModelGatewayController` 对所有请求使用硬编码的单一 provider（`model: "default"` 直接路由到 `zhipu`）。`ModelChatResponse.usage` 字段虽已定义，但 `costUsdMicros` 从未填充。这导致：

1. 无法在不改代码的情况下切换 provider 或做 A/B 路由；
2. 成本数据缺失，无法做 per-tenant 计费或预算告警；
3. `model: "default"` 语义不透明，调用方无法知道实际使用了哪个 provider。

## What Changes

1. **Java `application.yml`**：新增 `openharness.model-router` 配置段，支持按 `model` 名称映射到 provider（`zhipu` / `anthropic` / `openai-compat`）；`default` 条目指向默认 provider。
2. **Java `ModelRouter`**（新 service）：根据请求的 `model` 字段查找 provider 配置，返回对应 `ProviderAdapter`；未命中时 fallback 到 `default`。
3. **Java `ModelGatewayController`**：将当前硬编码的 `zhipu` 调用替换为 `ModelRouter.resolve(model)` 调用。
4. **Java `CostCalculator`**（新 util）：根据 provider + model 的 per-token 价格表计算 `costUsdMicros`；价格表在 `application.yml` 中配置，缺失时返回 `null`（不阻断响应）。
5. **Java `ModelChatResponse`**：`usage.costUsdMicros` 由 `CostCalculator` 填充后返回给 TS Runtime。
6. **TS Runtime**：`AgentChatResponse` 新增可选 `usage?: { costUsdMicros?: number }` 字段，从最后一次 `ModelChatResponse.usage` 聚合并透传给 Frontend。

## Impact

- **Affected specs**: `provider-adapter`（MODIFIED: Model Router + Cost）
- **Affected code**:
  - `backend/src/main/java/.../service/ModelRouter.java`（新建）
  - `backend/src/main/java/.../service/CostCalculator.java`（新建）
  - `backend/src/main/java/.../api/ModelGatewayController.java`（修改）
  - `backend/src/main/resources/application.yml`（新增路由配置）
  - `agent-runtime/src/types.ts`（AgentChatResponse 加 usage）
  - `agent-runtime/src/agentLoop.ts`（聚合 usage）
- **Breaking changes**: 无（`usage.costUsdMicros` 为可选字段；`model: "default"` 行为不变，只是路由逻辑从硬编码变为配置驱动）
- **风险**: 低 — 路由逻辑新增分支，不修改现有 provider adapter 实现；价格计算失败不阻断响应
