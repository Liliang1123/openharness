# Agent Definition Loader Closeout

文档类型：实施收尾记录  
日志及版本：v1 / 2026-06-18 / add-agent-definition-loader archived

## 结论

通过：`add-agent-definition-loader` 已完成实现、验证和 OpenSpec 归档。

## 核心逻辑

- 在 `packages/shared-schema/src/index.ts` 新增 `AgentDefinitionSchema` 与 `AgentDefinition`：
  - `agentId`：稳定标识符。
  - `promptRef`：`promptId@version` 格式。
  - `tools`：唯一工具名 allow-list，默认 `[]`。
  - `model`：可选 metadata/hint。
- 在 `agent-runtime/src/agentDefinitionLoader.ts` 新增本地 JSON loader：
  - 默认读取 `process.cwd()/agents`。
  - 目录不存在或没有 `.json` 文件时返回 `DEFAULT_AGENT_DEFINITION`。
  - malformed JSON、schema invalid、duplicate `agentId` 均 fail closed。
  - 只处理当前目录下 `.json` 文件，不递归、不读取 YAML。
- 在 `agent-runtime/src/server.ts` 初始化时加载 agent definition registry：
  - 新增 `agentDefinitionRegistry` 和 `agentDefinitionsDir` 测试/嵌入入口。
  - 使用 `app.decorate("agentDefinitionRegistry", registry)` 保留后续扩展点。
  - 不改变现有 chat API、Java model router、Frontend、SDK、YAML、remote CRUD API 或 hot reload。

## 测试覆盖

- `packages/shared-schema/test/schema.test.ts`
  - valid definition。
  - invalid `agentId`。
  - invalid `promptRef`。
  - duplicate tools。
- `agent-runtime/test/agentDefinitionLoader.test.ts`
  - missing directory fallback。
  - empty directory fallback。
  - valid JSON load by `agentId`。
  - ignore non-json files。
  - malformed JSON fail closed。
  - invalid schema fail closed。
  - duplicate `agentId` fail closed。
- `agent-runtime/test/agentRuntime.test.ts`
  - missing definitions directory 不破坏默认 chat。
  - malformed definition 会导致 startup fail。

## 验证记录

- TDD RED：
  - `pnpm --filter @openharness/shared-schema test -- schema`：`AgentDefinitionSchema` 未实现时失败。
  - `pnpm --filter @openharness/agent-runtime test -- agentDefinitionLoader`：loader 文件未实现时失败。
  - `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：malformed definition 未触发 startup fail 时失败。
- Targeted GREEN：
  - `pnpm --filter @openharness/shared-schema test -- schema`：29 tests passed。
  - `pnpm --filter @openharness/agent-runtime test -- agentRuntime agentDefinitionLoader`：15 tests passed。
  - `pnpm --filter @openharness/shared-schema typecheck`：passed。
  - `pnpm --filter @openharness/agent-runtime typecheck`：passed。
  - `npx openspec validate add-agent-definition-loader --strict --no-interactive`：valid。
- Full verification：
  - 沙箱内 `pnpm test` 因 `listen EPERM: operation not permitted 127.0.0.1` 失败。
  - 用户授权沙箱外重跑同一完整命令通过：
    - `pnpm typecheck`：passed。
    - `pnpm test`：shared-schema 29、agent-runtime 177、frontend 11、integration-tests 17 全部 passed。
    - `mvn test -f backend/pom.xml`：BUILD SUCCESS，26 tests passed。
    - `npx openspec validate --all --strict --no-interactive`：22 passed / 0 failed。
- Archive：
  - `npx openspec archive add-agent-definition-loader --yes`
  - archived path：`openspec/changes/archive/2026-06-18-add-agent-definition-loader/`
  - post-archive `npx openspec validate --all --strict --no-interactive`：22 passed / 0 failed。
  - post-archive `npx openspec list`：No active changes found。

## 风险与注意事项

- `tools` 字段当前是 definition metadata / allow-list 记录，不等同于 Java policy enforcement。
- `model` 字段当前仅保留为 metadata/hint，不改变 Java model router 行为。
- 未新增 YAML parser、SDK、Frontend UI、remote CRUD API、hot reload 或 tenant-scoped dynamic definitions。
- OpenSpec CLI 的 PostHog 网络上报失败是非阻塞 telemetry 噪声。

## 后续待办

- 若要让 `tools` 真正过滤 ToolRegistry 或进入 PolicyContext，需要新建 OpenSpec change。
- 若要支持 YAML、SDK、Agent Definition API/UI 或 tenant-scoped dynamic definitions，需要分别新建后续 change。
