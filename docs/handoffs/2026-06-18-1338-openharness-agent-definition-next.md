# New Window Handoff: OpenHarness Agent Definition 下一步

## 使用方式
把本文件内容粘贴到新的 Codex 窗口，并要求继续执行未完成任务。

## 背景
- 项目路径：`/Users/elvis/file/develop/opensource/openharness`
- 当前目标：继续 OpenHarness P2/P3 能力演进；最近刚完成 `Agent Definition Loader v0`，下一步应基于已落地的本地 agent definition 做一个新的小切片。
- 关键约束：
  - 默认中文回复。
  - 开发任务必须遵守 `AGENTS.md`、`openspec/AGENTS.md`、`openspec-superpower-change`、Superpowers TDD/verification 工作流。
  - 新能力/API/架构/运行时语义变化必须先创建 OpenSpec change，获批后再写 Superpowers plan，再 TDD 实施。
  - 未经用户明确要求，禁止顺带格式化、批量重排 import 或修改无关文件。
  - 项目当前不是常规已提交 feature branch/worktree；不要假设可安全 merge/PR/cleanup。

## 已完成
- [x] 归档 `add-p5e-eval-fixtures`：新增 Eval CLI canonical fixture 和 deterministic smoke。
- [x] 归档 `add-agent-definition-loader`：新增 JSON-first 本地 Agent Definition Loader。
- [x] 已补充 `CONTEXT.md` 术语：`Agent Definition`、`Agent Definition Loader`。
- [x] 已创建/归档 OpenSpec spec：`openspec/specs/agent-definition/spec.md`。
- [x] 已落盘设计和收尾文档：
  - `docs/design/2026-06-18-agent-definition-loader-design.md`
  - `docs/design/2026-06-18-add-agent-definition-loader-closeout.md`
  - `docs/design/2026-06-18-add-p5e-eval-fixtures-closeout.md`
- [x] 已生成实施计划：`docs/superpowers/plans/2026-06-18-add-agent-definition-loader.md`。

## 当前状态
- Active change：无。`npx openspec list` 输出 `No active changes found.`
- Archived changes（最近关键项）：
  - `openspec/changes/archive/2026-06-18-add-agent-definition-loader/`
  - `openspec/changes/archive/2026-06-18-add-p5e-eval-fixtures/`
  - `openspec/changes/archive/2026-06-05-add-p5d-eval-cli/`
  - `openspec/changes/archive/2026-06-05-add-p5c-memory-management-api/`
  - `openspec/changes/archive/2026-06-05-add-p5b-memory-context-retrieval/`
  - `openspec/changes/archive/2026-06-05-add-p5a-memory-and-eval/`
- 当前 spec 状态：`openspec/specs/agent-definition/spec.md` 已存在，OpenSpec 全量校验通过。
- 服务/端口状态：本轮未启动长期后台服务；没有记录需要清理的服务进程。

## 未完成 / 下一步
- [ ] 选择下一项 OpenHarness 小切片。
- [ ] 推荐优先做：`Agent Definition Runtime Selection`（建议 change-id：`add-agent-definition-runtime-selection`）。
  - 目标：让 chat 请求可选携带 `agentId`，runtime 按 `agentId` 解析已加载 definition，并把 `promptRef` 接入 PromptRegistry；工具 allow-list 先只作为 metadata 或最小过滤需另行确认。
  - 这属于用户可见请求契约/运行时语义变化，必须先 OpenSpec proposal，不要直接编码。
- [ ] 备选下一项：`Agent Definition Tool Filtering`。
  - 目标：用 definition 的 `tools` allow-list 过滤 ToolRegistry 暴露给 model 的工具。
  - 风险：会改变工具可见性和 policy 语义，需更谨慎设计。
- [ ] 备选下一项：`Agent Definition JSON Fixture/Dev Example`。
  - 目标：补一个项目内 example definition 和 dev runbook。
  - 风险较低，但业务价值低于 runtime selection。

## 建议下一步
- 建议先做：`Agent Definition Runtime Selection` 的 OpenSpec proposal。
- 不建议现在做：完整 SDK、YAML、Frontend UI、remote CRUD API、tenant-scoped dynamic definitions、hot reload。
- 原因：这些范围过大；当前刚完成 loader，下一步应该先证明 definition 能被一次 agent turn 选择和审计，继续小步归档。

## 涉及文件
- 项目规则：
  - `AGENTS.md`
  - `openspec/AGENTS.md`
  - `CONTEXT.md`
- 当前 agent definition 能力：
  - `openspec/specs/agent-definition/spec.md`
  - `openspec/changes/archive/2026-06-18-add-agent-definition-loader/proposal.md`
  - `openspec/changes/archive/2026-06-18-add-agent-definition-loader/design.md`
  - `openspec/changes/archive/2026-06-18-add-agent-definition-loader/tasks.md`
  - `openspec/changes/archive/2026-06-18-add-agent-definition-loader/specs/agent-definition/spec.md`
- 实现文件：
  - `packages/shared-schema/src/index.ts`
  - `packages/shared-schema/test/schema.test.ts`
  - `agent-runtime/src/agentDefinitionLoader.ts`
  - `agent-runtime/test/agentDefinitionLoader.test.ts`
  - `agent-runtime/src/server.ts`
  - `agent-runtime/test/agentRuntime.test.ts`
- 相关 prompt/runtime 文件：
  - `agent-runtime/src/prompts/registry.ts`
  - `agent-runtime/src/agentExecutionRunner.ts`
  - `agent-runtime/src/types.ts`
  - `packages/shared-schema/src/index.ts`
- 设计/计划/收尾：
  - `docs/design/2026-06-18-agent-definition-loader-design.md`
  - `docs/design/2026-06-18-add-agent-definition-loader-closeout.md`
  - `docs/design/2026-06-18-add-p5e-eval-fixtures-closeout.md`
  - `docs/superpowers/plans/2026-06-18-add-agent-definition-loader.md`
- 路线图参考：
  - `docs/vision/openharness-gap-analysis-and-roadmap.md`

## 验证记录
- `add-agent-definition-loader` targeted：
  - `pnpm --filter @openharness/shared-schema test -- schema`：29 tests passed。
  - `pnpm --filter @openharness/agent-runtime test -- agentRuntime agentDefinitionLoader`：15 tests passed。
  - `pnpm --filter @openharness/shared-schema typecheck`：passed。
  - `pnpm --filter @openharness/agent-runtime typecheck`：passed。
  - `npx openspec validate add-agent-definition-loader --strict --no-interactive`：valid。
- `add-agent-definition-loader` full：
  - 沙箱内 `pnpm test` 因 `listen EPERM: operation not permitted 127.0.0.1` 失败。
  - 用户授权沙箱外重跑同一完整命令通过：
    - `pnpm typecheck`：passed。
    - `pnpm test`：shared-schema 29、agent-runtime 177、frontend 11、integration-tests 17 全部 passed。
    - `mvn test -f backend/pom.xml`：BUILD SUCCESS，26 tests passed。
    - `npx openspec validate --all --strict --no-interactive`：22 passed / 0 failed。
  - 归档后：`npx openspec validate --all --strict --no-interactive`：22 passed / 0 failed。
  - 归档后：`npx openspec list`：`No active changes found.`
- `add-p5e-eval-fixtures` full：
  - `pnpm typecheck`：passed。
  - `pnpm test`：passed。
  - `mvn test -f backend/pom.xml`：BUILD SUCCESS。
  - `npx openspec validate --all --strict --no-interactive`：passed。

## 风险 / 注意事项
- OpenSpec CLI 经常出现 `edge.openspec.dev` / PostHog telemetry DNS 报错；只要命令 exit code 为 0 且输出 valid/pass，这是非阻塞 telemetry 噪声。
- 沙箱内运行需要监听 `127.0.0.1` 的 agent-runtime 测试可能出现 `listen EPERM`；需要按规则请求授权后在沙箱外重跑完整验证。
- `AgentDefinition.tools` 当前只是 definition metadata / allow-list 记录，不等于 Java policy enforcement。
- `AgentDefinition.model` 当前只是 metadata/hint，不改变 Java model router 行为。
- 不要重复实现或重新归档：
  - `add-agent-definition-loader`
  - `add-p5e-eval-fixtures`
  - `add-p5d-eval-cli`
  - `add-p5c-memory-management-api`
  - `add-p5b-memory-context-retrieval`
  - `add-p5a-memory-and-eval`
- 当前仓库顶层 `git status` 可能显示相关子目录为未跟踪目录；不要据此执行破坏性 git 操作。

## 给新窗口的启动指令
继续 OpenHarness 后续任务。先阅读：
1. `AGENTS.md`
2. `openspec/AGENTS.md`
3. `CONTEXT.md`
4. 本 handoff：`docs/handoffs/latest.md`
5. `openspec/specs/agent-definition/spec.md`
6. `openspec/changes/archive/2026-06-18-add-agent-definition-loader/design.md`
7. `docs/design/2026-06-18-add-agent-definition-loader-closeout.md`

不要重复已完成并归档的 `add-agent-definition-loader` 和 `add-p5e-eval-fixtures`。确认 `npx openspec list` 仍无 active change 后，建议从 `Agent Definition Runtime Selection` 开始：先使用 `openspec-superpower-change` 创建新 OpenSpec proposal/design/tasks/spec delta，等待用户批准，再写 Superpowers plan，最后 TDD 实施、验证、归档。
