# New Window Handoff: Runtime Chat Terminal Tool Flow → Pi

## 使用方式

把本文件内容和“给新窗口的启动指令”直接发给 Pi。Pi 应继续当前 approved change，不要重复 proposal、Plan Preflight、已完成的 RED/GREEN 实现或 Java 基线调查。

## 背景

- 项目主 checkout：[openharness](file:///Users/elvis/file/develop/opensource/openharness)
- 唯一允许继续实施的 worktree：[main-local-trial](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial)
- 当前目标：完成 `fix-runtime-chat-terminal-tool-flow`，修复浏览器永久“思考中”、五次 `read_file` 卡死缺少 terminal tool feedback，并在 fresh implementation Review PASS 后同步到用户本地 isolated source 做浏览器试用。
- 用户要求使用 Codex CLI，模型 `gpt-5.6-sol`，reasoning effort `high`。
- 关键约束：
  - 不修改[主 checkout](file:///Users/elvis/file/develop/opensource/openharness)。
  - 忽略且不得读写[用户指定的 Typora 目录](file:///Users/elvis/file/develop/notes/Typora/10_Projects/QAgent/AIAgent业务场景落地)。
  - 不 archive、merge、commit、push、reset、clean，不跑全仓回归或 24 小时 Gate，不声称 Production Verified。
  - 不提前做通用前端美化，不改变 reasoning effort，不新增 skill authoring/write 工具。
  - 仓库/行为变更必须遵守 OpenSpec 与 Superpowers 门禁；当前 change 已批准，可继续其范围内 bugfix。

## 已完成

- [x] 完整建立并严格验证 OpenSpec change `fix-runtime-chat-terminal-tool-flow`。
- [x] 用户批准 contract-centered Frontend + Runtime + Codex tool-flow 方案与实施。
- [x] Plan Preflight Review PASS。
- [x] Frontend projection TDD：
  - `executionActivity.ts` 安全 allowlist 投影；
  - durable `eventId` 去重、最新 execution 投影；
  - model/tool 状态与 terminal class 数据最小化；
  - 6 个 projection tests PASS。
- [x] Frontend component/App TDD：
  - 一个 execution activity group；
  - running 展开、terminal 自动折叠且可手动展开；
  - `read_file ×5` 汇总与五条明细；
  - App 在 final answer/approval 等 side effect 前去重；
  - 不再追加永久 thinking/tool system message；
  - running→terminal、terminal approval cleanup 与 approval 409 false-success 回归已补齐；Frontend focused 6 files、27 tests PASS，typecheck PASS。
- [x] Runtime persistence TDD：
  - RED 精确证明五个 `tool_call`、零个 `tool_result`；
  - continuation owner 在 provider submission/abort rethrow 前写一次安全 `tool_result`；
  - malformed pending 参数不再发出伪执行 `tool_call`；
  - success、deny、malformed、tool error、approval timeout、工具执行中 abort、definitive/structured provider failure 已有断言；
  - pre-execution abort、approval privacy/timeout cleanup、post-terminal stability 与 process-owner race 回归已补齐；Runtime focused 7 files、57 tests PASS，typecheck PASS。
- [x] Java 五次连续 callback/registry 回归已加入并 PASS；62 tests、0 failures、BUILD SUCCESS。没有修改本 change 范围内的 Java 生产代码。
- [x] Local CLI guide 已加入 `localhost` CORS、activity group、模型延迟、无 skill write 能力；Review 修复后 rollout/rollback 清单已扩为八个 production files。
- [x] OpenSpec strict、`git diff --check`、生产源/指南 canary scan 已通过。
- [x] 多轮独立 implementation Review 已检查实际 P0 scope；所有代码、rollout 与 handoff findings 均已修复，最终 fresh independent follow-up Review PASS，正式 Review 已落盘为“通过”。

## 当前状态

- Active OpenSpec changes：
  - `fix-runtime-chat-terminal-tool-flow`：active，`openspec list` 显示 `0/22 tasks`；这是因为 OpenSpec tasks 尚未做最终证据对账，不代表实现从零开始。
  - `add-runtime-chat-lifecycle-logs`：active、Complete、未归档。
  - `add-codex-reasoning-effort-config`：active、Complete、未归档。
- Archived changes：本轮没有归档；不要归档上述三个 change。
- Superpowers plan：
  - Task 1–6 已完成，implementation Review PASS；
  - Task 7–8 全部未完成。
- Dashboard：当前 change 仍是 `proposed`，不能提前改成 `verified`。
- Git/worktree：当前分支名为 `main`，但根目录是指定 isolated worktree；存在前两个 approved change 和本 change 的混合 dirty 状态，必须精确保留，不得清理或覆盖。
- 服务/端口状态（2026-07-30 17:20 CST）：
  - backend `8080`：RUNNING/readiness pass；
  - Runtime `3001`：RUNNING/readiness pass；
  - gateway helper `3101`：LISTEN；
  - Frontend `5173`：RUNNING/readiness pass；
  - 这些服务仍来自同步前的用户本地 isolated source，本次 P0 文件尚未 backup/sync，不能当作修复后 smoke 证据。
- 日志：
  - [backend.log](file:///Users/elvis/.local/state/openharness/logs/backend.log)
  - [runtime.log](file:///Users/elvis/.local/state/openharness/logs/runtime.log)
  - [frontend.log](file:///Users/elvis/.local/state/openharness/logs/frontend.log)
  - [supervisor.log](file:///Users/elvis/.local/state/openharness/logs/supervisor.log)

## 未完成 / 下一步

- [ ] 仅在用户明确继续 Task 7 时执行 user-local backup/sync/browser smoke：
  - wrapper `status → down`；
  - 为八个 production files 建立 scoped backup/hash/absent manifest；六个既有文件记录 hash/backup/restore，两个 activity 文件只有 before-state 为 absent 时才在 rollback remove；
  - 精确同步到[用户本地 isolated source](file:///Users/elvis/.local/share/openharness/source)；
  - isolated typecheck、`doctor → up → status`；
  - 浏览器 `http://localhost:5173` 三问 smoke、日志关联；
  - 用户验收后 `logs → down → status`。
- [ ] 最后才对账 OpenSpec tasks、dashboard `verified`、fresh verification 和最终六命令 PASS/FAIL 报告。

## 建议下一步

- 建议下一步：等待用户决定是否进入 Task 7；不要重复已完成的 RED/GREEN、focused suites、Java 五次回归、Plan Preflight 或 implementation Review。
- 不建议现在做：
  - 不要同步用户本地八文件；
  - 不要重启/停掉当前服务，除非用户明确继续 Task 7；
  - 不要归档 OpenSpec；
  - 不要修改 Java 生产代码；
  - 不要开发 skill write 能力或问答界面通用美化。
- 原因：implementation Review 已 PASS，但本轮用户指令只要求修复、focused verification 与 independent Review，尚未明确要求执行 user-local sync。

## 涉及文件

### 规则与交接

- [AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/AGENTS.md)
- [openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/AGENTS.md)
- [本 handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/2026-07-30-1720-runtime-chat-terminal-tool-flow-pi-handoff.md)
- [latest.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/latest.md)

### OpenSpec 与计划

- [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/proposal.md)
- [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/design.md)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/tasks.md)
- [frontend-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/frontend-runtime/spec.md)
- [agent-sse spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/agent-sse/spec.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/provider-adapter/spec.md)
- [implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md)

### Review

- [proposal review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-proposal-review.md)
- [plan preflight review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-plan-preflight-review.md)
- [implementation review — 通过](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-implementation-review.md)

### Frontend

- [executionActivity.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/executionActivity.ts)
- [ExecutionActivityGroup.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/ExecutionActivityGroup.tsx)
- [App.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/App.tsx)
- [App.css](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/App.css)
- [api.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/api.ts)
- [ApprovalCard.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/ApprovalCard.tsx)
- [executionActivity.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/executionActivity.test.ts)
- [ExecutionActivityGroup.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/ExecutionActivityGroup.test.tsx)
- [App.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/App.test.tsx)
- [ApprovalCard.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/ApprovalCard.test.tsx)

### Runtime

- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- [codexPendingTurnPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurnPersistence.test.ts)
- [codexPendingTurn.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurn.test.ts)
- [productionRunnerPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionRunnerPersistence.test.ts)
- [productionServerLifecycle.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionServerLifecycle.test.ts)
- [lifecycleCommands.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/storage/lifecycleCommands.ts)

### Java tests 与指南

- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [Local CLI wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)

## 验证记录

- Frontend RED：
  - projection 首次运行因 `executionActivity.ts` 不存在而 FAIL；
  - component/App 首次运行 4 个目标行为 FAIL（永久 thinking、无 activity group、无 safe upstream summary、重复 final answer）。
- Runtime RED：
  - persistence test 首次运行 2 FAIL：五次 call 但 result `[]`；
  - malformed 回归首次运行 1 FAIL：未执行工具却存在一个 `tool_call`。
- `pnpm --filter @openharness/frontend test -- test/ApprovalCard.test.tsx test/executionActivity.test.ts test/ExecutionActivityGroup.test.tsx test/App.test.tsx test/runtimeProgress.test.ts test/sseWire.test.ts`：6 files、27 tests PASS。
- `pnpm --filter @openharness/frontend typecheck`：PASS。
- `pnpm --filter @openharness/agent-runtime test -- test/codexPendingTurnPersistence.test.ts test/codexPendingTurn.test.ts test/lifecycleUnitOfWork.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/terminalErrors.test.ts test/streamEventIds.test.ts`：7 files、57 tests PASS。
- `pnpm --filter @openharness/agent-runtime typecheck`：PASS。
- `mvn -f backend/pom.xml -Dtest=CodexAppServerClientTest,CodexPendingTurnRegistryTest,CodexAppServerAdapterTest,CodexTurnControllerTest test`：62 tests、0 failures、BUILD SUCCESS。
- `openspec validate fix-runtime-chat-terminal-tool-flow --strict --no-interactive`：valid、exit `0`；PostHog `ENOTFOUND edge.openspec.dev` 仅为非阻塞 telemetry warning。
- `git diff --check`：PASS。
- `rg -n 'PROMPT-CANARY|ERROR-CANARY|ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY' frontend/src agent-runtime/src backend/src/main/java docs/guides/openharness-local-cli-wrapper.md`：0 matches，`rg` exit `1` 为预期。
- 独立 Review correction loop：旧 2 Important/3 Minor、approval cleanup/post-terminal、HTTP race、Frontend 409、rollout 与 handoff findings 均已修复；final follow-up Review PASS，Actionable findings 无。

## 风险 / 注意事项

- 当前 implementation Review 已 PASS，无未解决 actionable finding；Task 7 user-local sync/browser smoke 尚未执行。
- Frontend 27、Runtime 57、Java 62、两个 typecheck、OpenSpec strict、canary scan 与 whitespace 均已有 fresh PASS；后续若再改生产代码必须重新刷新受影响证据。
- 用户本地服务正在运行但未部署本 change；不要让用户基于当前页面判断新 activity group。
- `gpt-5.6-sol / high` provider latency 仍可能十几秒，本 change 不承诺降时延。
- 当前 catalog 无批准的 workspace write/edit tool，无法真正创建 skill；不要把 terminal flow 修复描述成 skill authoring。
- dirty worktree 包含前两个 approved changes；只按精确路径和 diff 工作，禁止 broad overwrite。
- 没有执行 P0 user-local backup/sync，也没有本次浏览器 smoke、日志关联或安全 down 证据。

## 给新窗口的启动指令

继续 `fix-runtime-chat-terminal-tool-flow`，只在 [main-local-trial](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial) 工作。先完整阅读本 handoff、[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/AGENTS.md)、[openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/AGENTS.md)、[implementation review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-implementation-review.md)、[OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/design.md) 和 [implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md)。

不要重复 proposal、批准、Plan Preflight、已完成的 RED/GREEN、focused suites、Java 五次回归或 implementation Review。先读已“通过”的[正式 implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-implementation-review.md)。只有用户明确要求继续 Task 7 时，才按更新后的八文件清单执行 scoped backup/sync/browser smoke。

Task 7 未开始前不得修改[用户本地 isolated source](file:///Users/elvis/.local/share/openharness/source)、不得跑新浏览器 smoke、不得把 dashboard 改成 `verified`。继续忽略[指定 Typora 目录](file:///Users/elvis/file/develop/notes/Typora/10_Projects/QAgent/AIAgent业务场景落地)，不要 archive/commit/push/reset/clean/全仓回归/24 小时 Gate，也不要声称 Production Verified。
