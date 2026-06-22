# Agent Definition Observability Closeout

- 文档类型：Closeout / Implementation Record
- 日志及版本：2026-06-18 v1
- OpenSpec change：`add-agent-definition-observability`
- Archive path：`openspec/changes/archive/2026-06-18-add-agent-definition-observability/`

## 结论

通过。本次变更已按 OpenSpec proposal/design/spec delta 和 Superpowers implementation plan 完成 TDD 实施、全量验证、OpenSpec 归档与开发导航台同步。

## 背景

`add-agent-definition-loader`、`add-agent-definition-runtime-selection` 和 `add-agent-definition-tool-filtering` 已让 TS Runtime 可以加载、选择并按 selected Agent Definition 过滤工具。但排查 prompt / tool filtering 问题时，仍需要从请求与代码路径推断本轮实际使用了哪个 definition。本次变更补齐 selected Agent Definition 的 model request metadata 与 TS trace attribution。

## 核心逻辑

### ModelChatRequest metadata

- 修改位置：`packages/shared-schema/src/index.ts`、`agent-runtime/src/agentExecutionRunner.ts`
- `ModelChatRequest.meta` 支持以下可选字段：
  - `agentId`
  - `agentPromptRef`
  - `agentToolMode`
  - `agentAllowedTools`
  - `modelVisibleTools`
- `agentToolMode` 仅允许：
  - `default_full`：内置 `default-agent` 且 `tools: []` 保持默认完整工具暴露。
  - `allow_list`：按 selected definition 的 `tools` 列表过滤；空列表表示 no-tool agent。

### Tool summary metadata

- `agentAllowedTools` 记录 selected Agent Definition 声明的工具名称列表。
- `modelVisibleTools` 记录 frozen catalog 过滤后实际发送给模型的工具名称列表。
- 元数据只记录工具名称，不复制 tool schema，不改变 ToolRegistry freeze/source routing、catalog version/hash 或 MCP routing。

### Trace attribution

- 修改位置：`agent-runtime/src/trace.ts`、`agent-runtime/src/agentExecutionRunner.ts`
- `traceEvent()` 支持接收 `agentId`。
- `AgentExecutionRunner.ev()` 将 selected `input.agentDefinition.agentId` 写入 TS Runtime trace event 顶层 `agentId`。

### 非模型可见

- Agent Definition 审计元数据只进入 `ModelChatRequest.meta` 和 trace event。
- 不追加到 `messages`。
- 不写入 stable `HistoryStore` 作为 agent message。
- 不改变 PromptRegistry system prompt 内容或用户/assistant/tool 历史消息。

## 非目标

本次变更明确不包含：

- YAML support
- SDK changes
- Frontend UI
- Remote CRUD APIs
- Hot reload
- Tenant-scoped dynamic definitions
- Java model router 或 `AgentDefinition.model` enforcement
- Java policy changes
- Java Tool Catalog changes
- ToolRegistry freeze / routing changes
- Model-visible message changes

## 关键测试覆盖

新增/更新测试文件：

- `packages/shared-schema/test/schema.test.ts`
- `agent-runtime/test/agentRuntime.test.ts`

覆盖场景：

1. `ModelChatRequest.meta` 可解析 Agent Definition 审计字段。
2. 未携带 Agent Definition 审计字段的旧请求仍有效。
3. 非法 `agentToolMode` 被 schema 拒绝。
4. selected custom agent 的 model request metadata 包含 `agentId`、`agentPromptRef`、`agentToolMode`、`agentAllowedTools`、`modelVisibleTools`。
5. default agent 的 metadata 显式标记 `default_full`。
6. unknown definition tool name 与实际 model-visible tools 的差异可通过 metadata 排查。
7. 审计 metadata 不污染 model-visible `messages`。
8. TS Runtime trace events 带 selected `agentId`。

## 验证记录

- `pnpm --filter @openharness/shared-schema test -- schema`：通过，32 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：通过，19 tests passed。
- `pnpm --filter @openharness/shared-schema typecheck`：通过。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `npx openspec validate add-agent-definition-observability --strict --no-interactive`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，shared-schema 32、agent-runtime 188、frontend 11、integration-tests 17。
  - 注：沙箱内因 `listen EPERM: operation not permitted 127.0.0.1` 失败，已按流程在沙箱外重跑通过。
- `mvn test -f backend/pom.xml`：通过，BUILD SUCCESS，26 tests。
  - 注：沙箱内因 Mockito/ByteBuddy self-attach 失败，已按流程在沙箱外重跑通过。
- `npx openspec validate --all --strict --no-interactive`：通过，23 passed / 0 failed。
  - 注：OpenSpec PostHog flush 网络错误为 telemetry 失败，命令 exit code 为 0。

## OpenSpec 归档结果

- Archived change：`openspec/changes/archive/2026-06-18-add-agent-definition-observability/`
- Updated current specs：
  - `openspec/specs/agent-definition/spec.md`
  - `openspec/specs/agent-runtime/spec.md`
  - `openspec/specs/shared-schema/spec.md`

## 开发导航台同步

- JSON SSOT：`docs/project-dashboard/development-log.json`
- Generated Markdown：`docs/project-dashboard/development-log.md`
- Generated HTML：`docs/project-dashboard/index.html`

同步节点：

1. `proposed`：proposal/design/tasks/spec delta 创建并 strict validate 后写入。
2. `verified`：TDD 实施与全量验证通过后写入。
3. `archived`：OpenSpec 归档与 closeout 完成后更新 archive path / closeout path。

## 后续建议

- 如需在前端显示 selected agent / tool filtering summary，应新建独立 OpenSpec change。
- 如需 provider/model 路由使用 `AgentDefinition.model`，应新建独立 OpenSpec change。
- 如需 YAML、SDK、remote CRUD、hot reload 或 tenant-scoped dynamic definitions，应继续按独立小切片推进。
