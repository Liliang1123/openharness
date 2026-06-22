# Cost Tracking and Model Router Closeout

文档类型：Closeout / Implementation Record  
日志及版本：2026-06-18 v1

## 结论

通过。`add-p3b-cost-and-router` 已经完整在本地实现、完成测试覆盖并确认可用。

## 背景

在早期骨架阶段，Java Model Gateway Controller 对所有请求均使用硬编码的单一 Mock Provider 进行回应，且没有计算 Token 消耗和估算消耗金额（USD micros），导致 TS Runtime 无法向前端回馈任何真实账单信息，更无法针对不同 Agent 划分不同的模型配置。

为了解决此运维和计费控制的非阻塞性缺陷，本次变更完成了模型路由网关与计费计算器：
1. 实现 Java 侧 `ModelRouter`，根据 `application.yml` 里的映射表，将逻辑模型（如 `glm-4-flash`, `claude-sonnet-4-20250514`）路由到对应的商业大模型服务商（Zhipu, Sensenova, Anthropic）；
2. 实现 `CostCalculator`，根据各 Provider 设置的每百万 token 的计费费率（`pricing` 费率表，包含输入/输出 token 单价），在每次模型请求结束后动态折算 `costUsdMicros` 写入 `usage` 并回传；
3. TS 运行时通过 API/SSE 管道，将 `usage.costUsdMicros` 完好透传至前端及 Trace 事件。

## 核心逻辑

- **Model Router 解析与 Fallback**：
  - 核心由 `ModelRouter.java` 实现，读取配置后依据 map 判定。若未命中显式指定的 model 路由，则回退到 `default` 路由所指向的 provider 实例；若无 default 配置则使用第一顺序注册商。
- **费用计算器 (CostCalculator)**：
  - `CostCalculator.java` 负责根据 `pricing`（单位：USD micros / M tokens）和本次大模型服务商返回的 `promptTokens` 与 `completionTokens` 实时折算。未配置定价费率的模型默认返回 `null`（不污染 usage 字段，防止影响模型逻辑）。
- **配置与密钥修正**：
  - 修正了 Zhipu provider 使用 `ZHIPU_API_KEY` 及旧版 `SENSENOVA_API_KEY` 兼容降级模式的配置名歧义，规范了 Anthropic 等商业 Key 的环境变量代签。

## 规格与计划

- OpenSpec archive：`openspec/changes/archive/2026-06-05-add-p3b-cost-and-router/`
- Current specs：
  - `openspec/specs/provider-adapter/spec.md`
- Superpowers implementation plan：`docs/superpowers/plans/2026-06-05-add-p3b-cost-and-router.md`
- Development dashboard：`docs/project-dashboard/development-log.json`

## 已完成范围

- **路由网关服务 (Java)**：
  - [ModelRouter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java) 实现了基于 properties 的路由定向。
  - [CostCalculator.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CostCalculator.java) 实现了动态 token-to-cost 精准乘积计算。
  - [ModelController.java:L77-L86](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/api/ModelController.java#L77-L86) 接入了路由适配器调用与 withCost 费用追填包装器。
- **TS Runtime 透传**：
  - [types.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/types.ts) 的 `AgentChatResponse` 扩充了计费与 token 占用透传的 Zod 声明。

## 非目标

- 本次变更不做 Java 内部 Model Router 运行时策略热加载，修改配置仍依赖容器重启。
- 不在此处做用户/租户层面的限流和额度超限阻断（仅实现审计数据收集，限流由后置 policy 执行）。

## TDD 与验证记录

### 单元测试与 TDD

- **Java 侧单元测试**：
  - `ModelRouterTest.java` 成功通过，测试了 explicit 映射、 fallback 与默认网关路由。
  - `CostCalculatorTest.java` 成功通过，覆盖了包含价格乘积计算和无配置时 fallback 为空的行为。
  - `ModelControllerTest.java` 回归通过，确保 Mock Model 仍然兼容运行。
- **TS 侧单元测试**：
  - `pnpm --filter @openharness/agent-runtime test -- agentRuntime` 通过，包含 `usage` 内 `costUsdMicros` 数据透传测试。

### 历史真机 E2E 连通验证

- **直连数据**：在本地导入正确的 API key 环境变量后，请求 `glm-4-flash` 返回 HTTP 200，后端成功在 Model Gateway 返回 `usage.costUsdMicros = 1`，并经 TS Agent Runtime 成功透传给最终客户端，全链路调通。

### 全量测试

- `pnpm test` (250 tests passed) 没有任何错误。
