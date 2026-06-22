## 1. Java: ModelRouter

- [x] 1.1 `application.yml`：新增 `openharness.model-router.default` 和 `openharness.model-router.routes` 配置段（`default: zhipu`，routes 示例条目）
- [x] 1.2 新建 `ModelRouter.java`（`@Service`）：注入配置，`resolve(String model)` 返回对应 `ProviderAdapter`；未命中时 fallback 到 default
- [x] 1.3 `ModelGatewayController.java`：将硬编码 provider 调用替换为 `modelRouter.resolve(request.model())`

## 2. Java: CostCalculator

- [x] 2.1 `application.yml`：在 provider 配置段加可选 `pricing.inputPerMToken` / `outputPerMToken`（单位 USD micros / M tokens）
- [x] 2.2 新建 `CostCalculator.java`（`@Component`）：`calculate(providerName, modelName, promptTokens, completionTokens)` → `Long costUsdMicros`；无价格配置时返回 `null`
- [x] 2.3 `ModelGatewayController.java`：在返回 `ModelChatResponse` 前调用 `CostCalculator`，填充 `usage.costUsdMicros`

## 3. TS Runtime: Usage 透传

- [x] 3.1 `agent-runtime/src/types.ts`：`AgentChatResponse` 加 `usage?: { costUsdMicros?: number }`
- [x] 3.2 `agent-runtime/src/agentLoop.ts`：`run()` 记录最后一次 `ModelChatResponse.usage`，在 `response()` 中填充 `usage`
- [x] 3.3 `agent-runtime/src/agentStreamLoop.ts`：同样透传 usage（SSE 路径）

## 4. Tests

- [x] 4.1 Java：`ModelRouterTest`——explicit mapping / fallback / default 三个 case
- [x] 4.2 Java：`CostCalculatorTest`——有价格配置时计算正确 / 无配置时返回 null
- [x] 4.3 Java：`BackendApiTest` 回归——现有 mock model 测试仍全绿
- [x] 4.4 TS：`agentRuntime.test.ts` 加断言：`response.usage` 存在时 `costUsdMicros` 透传

## 5. Verification

- [x] 5.1 `mvn test` 全绿
- [x] 5.2 `pnpm typecheck && pnpm --filter @openharness/agent-runtime test`
- [x] 5.3 `npx openspec validate add-p3b-cost-and-router --strict --no-interactive`
- [x] 5.4 真 LLM E2E：发一条消息，确认 `AgentChatResponse.usage.costUsdMicros` 有值（zhipu 有价格配置时）

> 2026-06-05 E2E：从 `.env` 导入 `SENSENOVA_API_KEY` 后，Zhipu `glm-4-flash` 直连返回 HTTP 200；Java `/api/v1/model/chat` 返回 `usage.costUsdMicros=1`；TS Runtime `/api/v1/agent/chat` 返回 `usage.costUsdMicros=1`。
