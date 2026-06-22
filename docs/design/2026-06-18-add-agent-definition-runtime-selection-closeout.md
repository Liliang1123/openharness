# Agent Definition Runtime Selection Closeout

文档类型：实施收尾记录  
日志及版本：v1 / 2026-06-18 / add-agent-definition-runtime-selection archived

## 结论

通过：`add-agent-definition-runtime-selection` 已完成实现、验证和 OpenSpec 归档。

## 核心逻辑

- `/api/v1/agent/chat` 和 `/api/v1/agent/chat/stream` 支持可选 `agentId`。
- TS Runtime 在 route handler 中从已加载 `AgentDefinitionRegistry` 解析 selected definition。
- 未传 `agentId` 时选择 `default-agent`，保持既有默认行为。
- 未知 `agentId` 返回 `AGENT_DEFINITION_NOT_FOUND`，不会启动 execution 或调用 Java model gateway。
- `AgentExecutionInput` / `StreamInput` 携带 resolved `AgentDefinition`，model call 使用 `agentDefinition.promptRef` 调用 `PromptRegistry`。
- 未知 `promptRef` 在 Java `/api/v1/model/chat` 前 fail closed，并以 runner 的 `MODEL_ERROR` 终止路径呈现。
- Eval replay harness 与 runner 单测直接调用 execution input 时显式使用 `DEFAULT_AGENT_DEFINITION`，保持内部调用路径确定性。

## 非目标确认

- 未实现 tools allow-list enforcement / filtering。
- 未实现 YAML、SDK、Frontend UI、remote CRUD API、hot reload、tenant-scoped dynamic definitions。
- 未改变 Java model router 或 `AgentDefinition.model` 语义。

## 测试覆盖

- `agent-runtime/test/agentRuntime.test.ts`
  - sync chat 指定 `agentId` 时使用 selected definition 的 prompt metadata。
  - sync chat 省略 `agentId` 时保持 default-agent/default-prompt 行为。
  - 未知 `agentId` 返回 400，且不调用 catalog/model。
  - selected definition 的未知 `promptRef` 在 Java model call 前 fail closed。
  - stream chat 指定 `agentId` 时同样使用 selected definition 的 prompt metadata。
- 既有 runner/eval/timeout/terminal tests 更新为显式传入 `DEFAULT_AGENT_DEFINITION`，保持类型契约与测试确定性。

## 验证记录

- TDD RED：
  - `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：新增测试中 2 项按预期失败：未知 `agentId` 返回 200、未知 `promptRef` 返回 `FINAL_ANSWER`。
- Targeted GREEN：
  - `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：13 tests passed。
  - `pnpm --filter @openharness/agent-runtime typecheck`：passed。
  - `npx openspec validate add-agent-definition-runtime-selection --strict --no-interactive`：valid。
- Full verification：
  - `pnpm typecheck`：passed。
  - 沙箱内 `pnpm test` 因 `listen EPERM: operation not permitted 127.0.0.1` 失败；沙箱外重跑同一命令通过：shared-schema 29、agent-runtime 182、frontend 11、integration-tests 17 全部 passed。
  - 沙箱内 `mvn test -f backend/pom.xml` 因 Mockito/ByteBuddy self-attach 权限失败；沙箱外重跑同一命令通过：BUILD SUCCESS，26 tests passed。
  - `npx openspec validate --all --strict --no-interactive`：23 passed / 0 failed。
- Archive：
  - `npx openspec archive add-agent-definition-runtime-selection --yes`
  - archived path：`openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/`

## 风险与注意事项

- `tools` 字段仍是 definition metadata，不等于 policy enforcement。
- `model` 字段仍是 metadata/hint，不影响 Java model router。
- OpenSpec CLI PostHog telemetry 网络错误为非阻塞噪声，以命令 exit code 和 valid/pass 输出为准。
- 当前仓库在父级 git 中显示 `openharness/` 为未跟踪目录，`git diff --stat` 不能作为完整范围证据；本轮以精确文件清单和验证命令控范围。

## 后续待办

- 若要按 definition `tools` 过滤 ToolRegistry，需要新建独立 OpenSpec change。
- 若要支持 YAML、SDK、UI、remote CRUD、hot reload 或 tenant-scoped dynamic definitions，需要分别新建后续 change。
