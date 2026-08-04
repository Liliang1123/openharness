# Runtime Chat Terminal Tool Flow Implementation Review

## 结论

通过。当前 P0 实现、Review correction loop、八文件 rollout/rollback 清单与 fresh independent follow-up Review 均无未解决 actionable finding。

本结论只批准进入后续 user-local backup/sync/browser smoke 门禁，不代表已经同步、部署、完成浏览器验收、更新 dashboard、归档 OpenSpec 或达到 Production Verified。

## Review 范围

### OpenSpec 与计划

- [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/proposal.md)
- [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/design.md)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/tasks.md)
- [frontend-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/frontend-runtime/spec.md)
- [agent-sse spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/agent-sse/spec.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/provider-adapter/spec.md)
- [implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md)

### Frontend production 与 tests

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

### Runtime production 与 tests

- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- [codexPendingTurn.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurn.test.ts)
- [codexPendingTurnPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurnPersistence.test.ts)
- [productionRunnerPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionRunnerPersistence.test.ts)
- [productionServerLifecycle.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionServerLifecycle.test.ts)

### Java、指南与 handoff

- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [Local CLI wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)
- [timestamp handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/2026-07-30-1720-runtime-chat-terminal-tool-flow-pi-handoff.md)
- [latest handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/latest.md)

## 主要发现

### Critical

无。

### Important

无未解决项。以下 correction loop 均已完成 RED → GREEN → focused verification → independent rereview：

1. initial/later pending response 后立即 abort 现在先写安全 `tool_result`，再执行 exact cancel 与 `stream_error`；未开始工具不执行，later call 不提交 provider completion。
2. persistence-mode transient approval 的原始参数只保留在 process owner；durable approval/event 使用安全占位和分类，不含 `ARG-CANARY`。
3. approval timeout 会清理 process raw pending 与 durable pending；tool feedback 保持 `timeout`。
4. delayed tool 的 execution timeout 不提交 provider completion；工具 settle 后不会在 terminal event 之后追加 durable trace/event。
5. process approval owner 先仲裁 HTTP decision/timeout race；race loser fail closed，durable-only orphan 返回 `409 APPROVAL_NOT_PENDING`。
6. Frontend 在 matching tool/execution terminal 后移除 ApprovalCard；HTTP 409 不再显示“已批准”、不调用成功回调，也不显示响应正文 canary。
7. user-local rollout 已从旧五文件更新为八个 production files；六个既有文件执行 hash/backup/restore，两个 activity 文件仅在 before-state 为 absent 时 rollback remove。

### Minor

无未解决项。running→terminal rerender、execution timeout、五次 durable interleave/result-before-next-pending 三项旧 Minor 均已有确定性回归。

## 验证证据

- Frontend focused：6 files、27 tests PASS。
- Frontend `tsc --noEmit`：PASS。
- Runtime focused（含 pending persistence 与 production server race）：7 files、57 tests PASS。
- Runtime `tsc --noEmit`：PASS。
- Java Codex focused：62 tests、0 failures、`BUILD SUCCESS`；使用 Maven 3.6.3、指定 settings 与本地仓库。
- `openspec validate fix-runtime-chat-terminal-tool-flow --strict --no-interactive`：valid、exit `0`；PostHog `ENOTFOUND edge.openspec.dev` 为非阻塞 telemetry warning。
- production source/guide canary scan：0 matches，`rg` exit `1` 符合预期。
- `git diff --check`：PASS。
- Fresh independent Codex CLI `gpt-5.6-sol / high` Review：实际文件、完整 P0 scope、关键测试和 adversarial probes 已检查；最终 follow-up verdict 为“通过”，`Actionable findings: 无`。
- Final docs gate：timestamp/latest handoff byte-identical；handoff/plan/guide 均列全八个 production paths；dashboard 仍为 `proposed`；六个 user-local 既有文件 hash 与 worktree 不同，两个 activity 文件 absent，证明尚未执行本轮 sync。

## 已确认边界

- Java 继续保持 test-only；没有证据支持修改 Java 生产代码。
- Shared schema、Runtime database schema、reasoning effort、provider credential/OAuth、wrapper contract 均未改变。
- mixed dirty worktree 中另外两个 approved changes 已排除，没有作为本 change finding。
- 没有执行 user-local backup/sync、服务重启、浏览器 smoke、dashboard `verified`、OpenSpec archive、commit、push、reset、clean、全仓回归或 24 小时 Gate。

## 最终建议

1. Task 6 implementation Review gate 可以标记完成。
2. 只有在明确继续 Task 7 时，才按更新后的八文件清单执行 wrapper `status → down`、scoped backup/manifest、精确同步、isolated typecheck、doctor/readiness 与浏览器 smoke。
3. 任一 backup/hash/readiness/privacy/browser 验证失败，按六文件 restore + 两个 only-if-absent remove 规则回滚并停止服务。
4. Task 7 未完成前不得把 dashboard 改为 `verified`，不得对账 OpenSpec 完成或声称 Production Verified。

## 后续门禁

- 当前 active OpenSpec `fix-runtime-chat-terminal-tool-flow` 足以覆盖实现与 Review 修复，无需新 proposal。
- 不需要新的 Superpowers implementation plan；继续使用已更新的现有 plan。
- 仍需 Task 7 user-local backup/sync/browser smoke 与用户验收，之后才可进入 Task 8 reconciliation。
- 项目规则未修改。
