# Runtime Chat Terminal And Codex Tool Flow Proposal Review

## 结论

通过：`fix-runtime-chat-terminal-tool-flow` 已将浏览器试用发现的终态残留、错误不可见和 Codex 同 turn 顺序工具调用失败收敛为一个 strict OpenSpec 合同。方案保留全部安全执行状态并提供交互折叠，要求 persistence-mode durable tool result 配对，并收紧 Java pending responder 的顺序生命周期；同时明确不把真实模型慢、token streaming 或 skill 写入能力混入 P0。proposal、design、tasks、三个 spec delta、领域术语与 dashboard proposed 状态均完整，strict validation 已通过。当前只允许请求针对该 change-id 的实施批准，不允许提前修改实现代码或生成 Superpowers implementation plan。

## Review 范围

- 项目治理：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/AGENTS.md)
- OpenSpec 治理：[openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/AGENTS.md)
- 领域术语：[CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/CONTEXT.md)
- Proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/proposal.md)
- Design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/design.md)
- Tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/tasks.md)
- Frontend delta：[frontend-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/frontend-runtime/spec.md)
- SSE delta：[agent-sse spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/agent-sse/spec.md)
- Provider delta：[provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/specs/provider-adapter/spec.md)
- 当前 Frontend contract：[frontend-runtime spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/specs/frontend-runtime/spec.md)
- 当前 SSE contract：[agent-sse spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/specs/agent-sse/spec.md)
- 当前 Provider contract：[provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/specs/provider-adapter/spec.md)
- 当前 Frontend 投影：[App.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/App.tsx)
- 当前 Runtime continuation：[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
- 当前 Java bridge：[CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- 当前 Runtime focused tests：[codexPendingTurn.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurn.test.ts)
- 当前 Frontend focused tests：[App.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/App.test.tsx)
- Dashboard 数据源：[development-log.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json)
- Dashboard 生成物：[development-log.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.md)
- Dashboard 浏览入口：[index.html](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/index.html)
- 本地诊断日志：[runtime.log](file:///Users/elvis/.local/state/openharness/logs/runtime.log)
- 既有 verified change：[add-codex-reasoning-effort-config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config)
- 既有 verified change：[add-runtime-chat-lifecycle-logs](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs)

## 主要发现

### High：方案同时修复显示假象与真实协议失败

仅删除 Frontend 的“思考中”只能遮住表象，无法解释五次 `read_file` 后出现的 `PROTOCOL_FAILURE`。当前合同把问题拆成同一闭环中的三个责任：

- Frontend 只做可重建的安全 execution projection；
- Runtime 对每个 Codex pending call 提供 durable terminal tool feedback；
- Java 在同一 app-server turn 内按顺序退休并接受 pending responder。

三个责任通过既有 `executionId`、`toolCallId` 和 durable event identity 连接，没有引入第二套 execution lifecycle。

### High：工具结果配对不会导致工具重放

新增 SSE requirement 明确区分“工具执行结果已提交”和“Provider continuation 随后失败”。即使 continuation 以 `MODEL_ERROR / PROTOCOL_FAILURE` 终止，已完成的工具结果仍保留，Runtime 只追加一个 execution terminal event，不再次执行工具、不静默开启新 turn，也不切换 provider。该边界与既有 completion idempotency、无 fallback 和 detached runner 语义兼容。

### High：安全字段采用 allowlist

Frontend activity group 和 Runtime durable feedback 只允许 event identity、kind、timing、step、tool id/name/status、Runtime terminal class 与安全 upstream class。proposal 明确禁止 raw arguments、result content、prompt/reasoning、headers、tenant/user 额外暴露、bridge id、OAuth、Authorization、provider body 和未脱敏错误正文；Java 仍只返回 bounded redacted response。

### Medium：交互折叠满足“保留所有状态”而不污染聊天记录

终态不删除安全历史，而是把同一 execution 自动折叠为一行摘要；相同工具显示计数，展开后仍逐项可查。`model_call_end`、`stream_done` 和 `stream_error` 都能关闭 transient thinking，错误终态保持可见，符合用户批准的 A 方案。

### Medium：真实模型延迟被正确隔离

诊断显示普通问答的绝大多数耗时发生在 `gpt-5.6-sol / high` Provider 调用内部。本 proposal 只保证真实过程反馈与终态，不承诺缩短模型推理，也不偷偷把 `high` 改成 `medium`。token-level streaming 与 reasoning-effort 调整继续作为独立决策。

### Medium：Skill 创建能力仍明确不在 P0

当前正式目录不提供受控 workspace 写入能力。P0 完成后，skill 创建请求应正常完成或明确终止，不再以陈旧 thinking/工具卡表现为卡死；真正新增 skill authoring、写入 containment、approval 与 rollback 必须使用独立 OpenSpec proposal。

### Medium：与两个既有 verified active changes 无冲突

`add-codex-reasoning-effort-config` 负责 provider reasoning 配置，`add-runtime-chat-lifecycle-logs` 负责 stdout accepted/terminal projection。本 change 不归档、不重做其实现，只复用 `gpt-5.6-sol / high` 与 lifecycle log 作为后续定向 smoke 环境。工作区已有 source 修改属于既有 approved changes，本 proposal 阶段未改任何实现源码。

### Low：实施必须继续使用 strict evidence

变更同时触及 UI projection、durable SSE 和 Provider bridge。实施前需在批准后生成 Superpowers plan，并通过 distinct Plan Preflight Review；实现使用 TDD，最终需要 focused tests、redaction canary、真实 Local Trial browser smoke 和 implementation Review。全仓回归、24 小时 Gate 与 Production Verified 不属于本轮证据。

## 验证记录

- `openspec validate fix-runtime-chat-terminal-tool-flow --strict --no-interactive`：PASS，退出码 0；OpenSpec PostHog 离线刷新 warning 非阻塞。
- `openspec show fix-runtime-chat-terminal-tool-flow --json --deltas-only`：PASS，解析出 3 个 delta、15 个 scenarios：
  - `frontend-runtime` ADDED；
  - `agent-sse` ADDED；
  - `provider-adapter` MODIFIED。
- Provider MODIFIED requirement 自审：保留原有完整 requirement 和 3 个 scenarios，并新增顺序 pending 与 overlap fail-closed 2 个 scenarios，满足 archive replacement 规则。
- proposal/design/tasks/spec delta 占位符扫描：PASS，无 `TBD`、`TODO`、`PLACEHOLDER` 或 `REPLACE_ME`。
- `node docs/project-dashboard/scripts/render-dashboard.mjs`：PASS，生成 39 entries。
- `pnpm dashboard:check`：PASS，Dashboard 生成物为 current。
- `git diff --check`（本 proposal、CONTEXT、dashboard）：PASS。
- 实现源码和测试：本 proposal 阶段未执行修改、测试或真实模型 smoke；这些仍受实施批准门禁约束。

## 最终建议

批准 exact change-id `fix-runtime-chat-terminal-tool-flow` 实施。批准后才调用 `superpowers:writing-plans`，在 [docs/superpowers/plans](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans) 生成单次可执行计划，并对该计划执行 strict Preflight Review。计划应按完整业务切片组织：contract-first tests → Frontend activity group → Runtime durable tool feedback → Java sequential responder → focused verification/Review → user-local backup/sync/browser smoke。

## 后续门禁

- 当前 change 状态：`proposed`，strict validation 与 proposal Review PASS。
- 当前批准范围：设计合同和 proposal 落盘；尚未获得 exact change-id 的实施批准。
- 下一门禁：用户明确回复“批准 `fix-runtime-chat-terminal-tool-flow` 实施”。
- 批准后：生成 Superpowers implementation plan，完成 Plan Preflight Review，之后才能修改实现源码。
- 后续实现门禁：TDD、focused verification、敏感 canary、implementation Review、用户本地备份/同步和真实浏览器 smoke。
- 禁止事项：修改主 checkout、自动工具重放、provider fallback、token streaming、reasoning-effort 变更、skill 写入能力、一般 UI 美化、全仓回归、archive、merge、commit、push、reset、clean、24 小时 Gate或 Production Verified 声称。
- 项目规则：未修改；仅补充 `Execution Activity Group` 领域术语。
