# Runtime Chat Terminal Tool Flow Plan Preflight Review

## 结论

通过。`fix-runtime-chat-terminal-tool-flow` 已获用户明确批准，OpenSpec 契约、实施计划、TDD 顺序、工作树边界、用户本地同步和失败回滚路径相互一致，可以进入实施。

本结论仅批准该 change 的聚焦实现与用户本地试用同步，不代表归档、合并、全仓回归、24 小时 Gate 或 Production Verified。

## Review 范围

- OpenSpec proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/proposal.md)
- OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/design.md)
- OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/tasks.md)
- Frontend delta：[frontend-runtime/spec.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/frontend-runtime/spec.md)
- Runtime SSE delta：[agent-sse/spec.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/agent-sse/spec.md)
- Provider delta：[provider-adapter/spec.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/provider-adapter/spec.md)
- Superpowers implementation plan：[2026-07-30-fix-runtime-chat-terminal-tool-flow.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md)
- Dashboard source：[development-log.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json)
- 预定生产代码范围：[frontend/src](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src)、[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
- 预定测试范围：[frontend/test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test)、[agent-runtime/test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test)、[Java provider tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider)

## 主要发现

### 阻塞级

无。

### 高

1. Java 生产代码不应因浏览器侧 `PROTOCOL_FAILURE` 推断而修改。现有聚焦基线 61 个 Java 测试已通过，且已有两次连续 pending callback 与 registry 顺序迁移覆盖。计划新增五次连续回调回归；只有该回归以明确的生命周期不变量失败时，才允许先运行系统化诊断、修订计划并重新通过 Preflight。当前批准范围内 Java 仅改测试。
2. Runtime 的已证实缺口是 persistence-mode Codex continuation 在 `persistHistory: false` 时存在 `tool_call` 而缺少事件型 `tool_result`。计划由 continuation owner 统一发出一次数据最小化 terminal result，并将它排在 provider completion 或 abort rethrow 之前，避免 UI 卡在运行中和重复事件。
3. Frontend 必须只保留安全投影，不能把原始事件或 `data` 对象放入活动模型。计划以 `eventId` 去重、以最新 `executionId` 投影，并通过 `PROMPT/ERROR/ARG/RESULT/BRIDGE/AUTH-CANARY` 验证敏感数据不进入生产状态和 UI。

### 中

1. TDD 顺序明确：Frontend projection RED/GREEN、Frontend component/App RED/GREEN、Runtime SQLite persistence RED/GREEN、Java 五次连续 callback 验证。任何 RED 若不是因目标能力缺失而失败，必须先诊断，不能把夹具错误当实现依据。
2. 终态交互语义完整：运行中展开，`stream_done`、`stream_error` 或 abort 后自动折叠；折叠仍显示安全 terminal/upstream class，用户可展开五次工具调用的安全时间顺序。
3. Runtime event 与 provider submission 分离：事件不含 tool content、arguments、bridge/thread/turn id、headers 或 error message；有界 content 仅传入 Java continuation。
4. 用户本地同步被限制为五个生产文件，先由 wrapper 停服，按文件建立 hash/absent manifest，再同步并校验。失败回滚只恢复三个既有文件、删除两个 manifest 明确为 absent 的新文件，不使用 Git 或宽泛删除。

### 低

1. `gpt-5.6-sol / high` 的模型调用仍可能持续十几秒；本 change 修复生命周期可见性与 terminal tool flow，不承诺降低 provider latency。
2. 当前 catalog 不提供批准的 workspace write/edit 能力，因此“创建 skill”只能可靠结束并展示安全结果/错误，不能在本 change 中真正生成 skill 文件。
3. OpenSpec strict validation 出现离线 PostHog DNS 告警，但目标 change 明确 valid 且退出码为 `0`，不构成实施阻塞。

## 验证证据

- Frontend 基线：`App.test.tsx`、`runtimeProgress.test.ts`，2 个文件、8 个测试 PASS。
- Runtime 基线：`codexPendingTurn.test.ts`、`lifecycleUnitOfWork.test.ts`、`productionRunnerPersistence.test.ts`，3 个文件、25 个测试 PASS。
- Java 基线：`CodexAppServerClientTest,CodexPendingTurnRegistryTest,CodexAppServerAdapterTest,CodexTurnControllerTest`，61 个测试 PASS，BUILD SUCCESS。
- `openspec validate fix-runtime-chat-terminal-tool-flow --strict --no-interactive`：PASS，exit `0`。
- `node docs/project-dashboard/scripts/render-dashboard.mjs`：PASS，39 entries。
- `pnpm dashboard:check`：PASS，生成物 current。
- `git diff --check`：PASS，exit `0`。
- Plan placeholder scan 仅命中扫描命令自身；边界词仅存在于禁止项、Review 要求和最终报告要求。

## 最终建议

按 [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md) 原顺序执行：

1. 先写 Frontend 与 Runtime RED tests，确认失败原因与批准缺口一致。
2. 只实现活动投影、交互分组和 Runtime event-only `tool_result`。
3. Java 只增加五次连续 pending callback/registry 回归；若失败则停止生产修改并重新过 Gate。
4. 聚焦验证与实现 Review PASS 后，才可同步五个生产文件到用户本地 isolated source。
5. 通过 wrapper 完成 doctor、up、status、browser/chat、logs、down；用户仍在测试时允许暂缓 down，但必须明确报告。

## 后续门禁

- 实施必须使用 `superpowers:executing-plans`、`superpowers:systematic-debugging` 和 `superpowers:test-driven-development`。
- 完成聚焦实现后必须使用 `superpowers:requesting-code-review`，将结论落盘到 [implementation review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-implementation-review.md)。
- 最终声明前必须使用 `superpowers:verification-before-completion`，并在最后一次相关修改后重跑聚焦命令。
- 不需要新的 OpenSpec proposal 才能实施本 change；若需要修改 Java 生产生命周期、正式增加 skill authoring/write 工具、调整 reasoning effort、token streaming 或其他新用户可见能力，则必须新建或正式扩展 OpenSpec 并重新等待批准。
- 禁止 archive、merge、commit、push、reset、clean、全仓回归、24 小时 Gate 和 Production Verified 声明。
