# Agent Definition Model Selection Closeout

文档类型：Closeout / Implementation Record  
日志及版本：2026-06-18 v1

## 结论

通过。`add-agent-definition-model-selection` 已完成实现、验证与 OpenSpec 归档。

## 背景

此前 Agent Runtime 已支持按 `agentId` 选择已加载的 Agent Definition，并接入 `promptRef`、工具 allow-list 与观测 metadata。但模型调用仍固定向 Java Backend 发送 `ModelChatRequest.model = "default"`，无法让不同 Agent Definition 使用不同的逻辑模型 id。

本次变更补齐 Agent Definition 的 runtime model selection：将 selected Agent Definition 的可选 `model` 字段作为 Java model gateway 请求的逻辑模型 id。

## 核心逻辑

- Runtime 在每轮 selected agent turn 内读取 `input.agentDefinition.model`。
- 若定义中存在 `model`，则将该值作为 `ModelChatRequest.model` 转发给 Java Backend。
- 若定义中省略 `model`，则保留既有默认逻辑模型 `default`。
- Runtime 不校验该逻辑模型 id 是否存在 Java route；未知模型 id 直接转发给 Java，由 Java Backend 的 model router、fallback、provider adapter 与错误处理负责。

关键实现：

- `agent-runtime/src/agentExecutionRunner.ts`
  - 新增 selected model resolution：`input.agentDefinition.model ?? "default"`
  - 将 Java model request 的 `model` 字段改为使用 selected Agent Definition model。

## 规格与计划

- OpenSpec archive：`openspec/changes/archive/2026-06-18-add-agent-definition-model-selection/`
- Current spec：`openspec/specs/agent-definition/spec.md`
- Superpowers implementation plan：`docs/superpowers/plans/2026-06-18-add-agent-definition-model-selection.md`
- Development dashboard：`docs/project-dashboard/development-log.json`

## 已完成范围

- selected Agent Definition 有 `model: "fast-model"` 时，Runtime 向 Java 发送 `ModelChatRequest.model = "fast-model"`。
- selected Agent Definition 省略 `model` 时，Runtime 保持 `ModelChatRequest.model = "default"`。
- selected Agent Definition 有未知逻辑模型 id 时，Runtime 不在 TS 侧校验 route，直接转发给 Java。
- OpenSpec `agent-definition` 当前规格新增 `Agent Definition Model Selection` requirement。

## 非目标

本次明确不做：

- Java model router、provider adapter、fallback 或 credential 逻辑变更。
- TS Runtime 复制 Java route 配置或校验模型 route 是否存在。
- SDK、Frontend UI、YAML、remote CRUD API、hot reload、tenant-scoped dynamic definitions。
- tools allow-list 行为变更。

## TDD 与验证记录

TDD RED：

- `pnpm --filter @openharness/agent-runtime test -- agentRuntime`
- 新增 selected/unknown model 用例后，测试按预期失败：实际仍为 `default`。

TDD GREEN / targeted verification：

- `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：21 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：passed。
- `npx openspec validate add-agent-definition-model-selection --strict --no-interactive`：valid；PostHog flush network error 在 exit 0 后出现，按项目约定忽略。

Full verification：

- `pnpm typecheck`：passed。
- `pnpm test`：sandbox 内因 `listen EPERM: operation not permitted 127.0.0.1` 失败；宿主权限重跑 passed，54 files / 250 tests passed。
- `mvn test -f backend/pom.xml`：passed，26 tests passed；Mockito dynamic agent warnings only。
- `npx openspec validate --all --strict --no-interactive`：23 items passed，0 failed；PostHog flush network error 在 exit 0 后出现，按项目约定忽略。

## 后续建议

- 下一步可在独立 OpenSpec change 中推进 Agent Definition SDK 或 Frontend UI 暴露，但不要混入本次 runtime model selection 归档范围。
- 若后续需要 model route 可视化或预校验，应保持 Java Backend 为路由事实源，另起规格设计 API/metadata 同步边界。
