# Agent Definition Tool Filtering Closeout

- 文档类型：Closeout / Implementation Record
- 日志及版本：2026-06-18 v1
- OpenSpec change：`add-agent-definition-tool-filtering`
- Archive path：`openspec/changes/archive/2026-06-18-add-agent-definition-tool-filtering/`

## 结论

通过。本次变更已按 OpenSpec proposal/design/spec delta 和 Superpowers implementation plan 完成 TDD 实施、全量验证、OpenSpec 归档与开发导航台同步。

## 背景

`add-agent-definition-loader` 和 `add-agent-definition-runtime-selection` 已让 TS Runtime 可以加载 Agent Definition，并允许 chat 请求通过可选 `agentId` 选择定义与 `promptRef`。但 `tools` 字段仍只是元数据，模型每轮仍可看到完整 frozen catalog。本次变更将 selected Agent Definition 的 `tools` 列表接入运行时工具可见性与工具调用资格判断。

## 核心实现

### Model-visible tools filtering

- 修改位置：`agent-runtime/src/agentExecutionRunner.ts`
- Runtime 仍先通过 `ToolRegistry.getFrozenCatalog()` 获取 per-conversation frozen catalog。
- 在发送 Java model chat request 前，根据 `input.agentDefinition.tools` 过滤 `catalog.tools`，仅把 selected definition 允许的工具暴露给模型。
- 过滤只影响本轮 model-visible tools，不改变 frozen source map、catalog version、catalog hash、MCP routing 或 Java catalog。

### Default agent compatibility

- 内置 `default-agent` 且 `tools: []` 保留历史行为：继续向模型暴露完整 frozen catalog。
- 该例外只按内置 default definition 身份生效，用于保持未传 `agentId` 的既有 chat 行为。

### Custom no-tool agents

- 自定义 selected Agent Definition 若 `tools: []`，表示 no-tool agent。
- Runtime 会向模型传递空 tools 列表。

### Unknown tool names

- Agent Definition 中不存在于 frozen catalog 的 tool name 不报错。
- 该名称不会匹配任何 model-visible tool，也不会被发送给模型。

### Fail-closed tool-call guard

- 模型返回 tool call 后，Runtime 在进入 `beforeToolUse()`、Java policy evaluation 或实际执行前校验 tool name。
- 若 tool name 不在 selected Agent Definition 的 `tools` allow-list 中，抛出 `RuntimeTerminalFailure`：
  - `errorClass`: `POLICY_DENY`
  - message: `Tool not allowed by agent definition: <toolName>`
- 该保护同样不改变 Java policy 或 MCP server 配置，仅在 TS Runtime 层短路。

## 非目标

本次变更明确不包含：

- Java policy changes
- Java Tool Catalog changes
- MCP server configuration 或 `mcpAllowList` changes
- YAML support
- SDK changes
- Frontend UI
- Remote CRUD APIs
- Hot reload
- Tenant-scoped dynamic definitions
- Java model router 或 `AgentDefinition.model` enforcement

## 关键测试覆盖

新增/更新测试文件：`agent-runtime/test/agentRuntime.test.ts`

覆盖场景：

1. selected Agent Definition 只暴露其 `tools` 列表内的 model-visible tools。
2. 未传 `agentId` 时，内置 `default-agent` 保留默认工具暴露。
3. 自定义 agent 的空 `tools` 列表暴露 no tools。
4. unknown definition tool names 被忽略且不暴露任何 frozen tool。
5. 模型返回不在 selected definition allow-list 内的 tool call 时，在 policy/execute 前 fail closed。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：通过，18 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `npx openspec validate add-agent-definition-tool-filtering --strict --no-interactive`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，shared-schema 29、agent-runtime 187、frontend 11、integration-tests 17。
  - 注：沙箱内因 `listen EPERM: operation not permitted 127.0.0.1` 失败，已按流程在沙箱外重跑通过。
- `mvn test -f backend/pom.xml`：通过，BUILD SUCCESS，26 tests。
  - 注：沙箱内因 Mockito/ByteBuddy self-attach 失败，已按流程在沙箱外重跑通过。
- `npx openspec validate --all --strict --no-interactive`：通过，23 passed / 0 failed。
  - 注：OpenSpec PostHog flush 网络错误为 telemetry 失败，命令 exit code 为 0。

## OpenSpec 归档结果

- Archived change：`openspec/changes/archive/2026-06-18-add-agent-definition-tool-filtering/`
- Updated current specs：
  - `openspec/specs/agent-definition/spec.md`
  - `openspec/specs/mcp-tools/spec.md`

## 开发导航台同步

- JSON SSOT：`docs/project-dashboard/development-log.json`
- Generated Markdown：`docs/project-dashboard/development-log.md`
- Generated HTML：`docs/project-dashboard/index.html`

同步节点：

1. `verified`：全量验证通过后写入本 change 记录，并重新生成 MD/HTML。
2. `archived`：OpenSpec 归档与 closeout 完成后更新 archive path / closeout path，并重新生成 MD/HTML。

## 后续建议

- 如需在 trace / metadata 中记录 selected tool list 或 filtered tool list，建议新建独立 OpenSpec change。
- YAML、SDK、Frontend UI、remote CRUD、hot reload、tenant-scoped dynamic definitions 均应作为独立 change 推进。
