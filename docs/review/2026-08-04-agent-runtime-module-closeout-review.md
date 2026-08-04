# Agent Runtime 功能模块收口 Review

## 结论

有风险：本轮实现、全量自动化验证和治理产物均通过，可以按功能模块提交并推送；但用户本地浏览器试用尚未执行，现有 Codex Gate C 生产资格报告绑定旧版客户端源码，因此当前版本必须继续 fail-closed，不得标记 Production Verified 或归档相关 OpenSpec change。

## Review 范围

- 目标 worktree：[main-local-trial](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial)
- OpenSpec 变更：[add-codex-reasoning-effort-config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config)、[add-runtime-chat-lifecycle-logs](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs)、[fix-runtime-chat-terminal-tool-flow](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow)
- Runtime 实现：[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)、[agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentStreamLoop.ts)、[runtimeChatLifecycleLog.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/runtimeChatLifecycleLog.ts)、[server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- Runtime 测试：[codexPendingTurnPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurnPersistence.test.ts)、[productionRunnerPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionRunnerPersistence.test.ts)、[productionServerLifecycle.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionServerLifecycle.test.ts)、[runtimeChatLifecycleLog.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/runtimeChatLifecycleLog.test.ts)、[gateCProviderPolicy.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/gateCProviderPolicy.test.ts)
- Frontend 实现与测试：[App.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/App.tsx)、[ExecutionActivityGroup.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/ExecutionActivityGroup.tsx)、[executionActivity.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/executionActivity.ts)、[App.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/App.test.tsx)、[ExecutionActivityGroup.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/ExecutionActivityGroup.test.tsx)
- Java Provider 实现与测试：[CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java)、[CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)、[ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)、[ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java)、[CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)、[CodexAppServerAdapterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerAdapterTest.java)
- 运行指南与治理产物：[openharness-local-cli-wrapper.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)、[development-log.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json)、[development-log.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.md)、[index.html](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/index.html)

## 主要发现

### P0：无未解决实现缺陷

Frontend execution activity、Runtime pending-turn 反馈与终态事件、Java Codex provider pending responder、reasoning-effort 配置和生命周期日志均通过对应 focused 与全量自动化验证。敏感参数、provider body、凭据和 bridge 标识仍未进入持久事件、UI 或生命周期日志。

### P1：Gate C 证据绑定已正确阻断

当前生产报告仍绑定客户端源码 SHA-256 `08b2…`，reasoning-effort 改动后的源码 SHA-256 为 `c74e…`。本轮没有修改或伪造生产报告；CLI 测试改为断言写出 `0600` 的 bounded blocked decision、返回退出码 `3`，并拒绝覆盖既有决策。真实资格必须在实际授权环境重新运行后再更新证据。

### P1：用户本地验收尚未闭环

用户本地 isolated source 尚未执行本轮 scoped backup/sync/browser smoke，因此 `fix-runtime-chat-terminal-tool-flow` 的 User-Local Trial 任务仍开放，dashboard 保持 `proposed`。本轮只完成仓库内实现和自动化验证，不声称真实 `gpt-5.6-sol / high` 浏览器验收通过。

### 学习蒸馏

本轮未发现需要新增到项目级 [CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/CONTEXT.md) 的稳定新规则；现有 fail-closed、证据绑定、敏感字段 allowlist 和 worktree 隔离约束已覆盖本轮发现。

## 验证记录

- 根级 TypeScript 测试：shared-schema 60 项、Agent Runtime 697 项、Frontend 39 项、Integration 17 项全部通过。
- 根级 TypeScript 类型检查：通过。
- Java 全量 Maven 测试：220 项，0 failures，`BUILD SUCCESS`。
- OpenSpec 严格全量校验：25 项通过，0 failed。
- Dashboard 重新渲染检查：产物最新，39 entries。
- `git diff --check`：通过。
- 生产源码、Runtime、Frontend、指南 canary 扫描：无命中。

## 最终建议

1. 以 `provider`、`runtime`、`frontend/terminal-flow` 和治理文档为边界精确提交，提交信息遵守中文分段式格式。
2. 推送当前 `main` 分支后，确认远端提交和工作树状态，再移除本地 [main-local-trial](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial) worktree；不触碰主 checkout [openharness](file:///Users/elvis/file/develop/opensource/openharness)。
3. 保留三个 active OpenSpec change；后续先完成用户本地 scoped backup/sync/browser smoke，再决定 dashboard `verified`、OpenSpec archive 和真实 Gate C 重新资格验证。

## 后续门禁

- 本轮不需要新 OpenSpec proposal；继续使用三个已批准的 change。
- 本轮不需要新 Superpowers implementation plan。
- 用户本地同步、浏览器 smoke、真实 Provider 资格重跑和 OpenSpec archive 仍是后续门禁。
- 项目规则未修改。
