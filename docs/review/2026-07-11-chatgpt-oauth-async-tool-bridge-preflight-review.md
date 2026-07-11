# ChatGPT/Codex OAuth 异步工具桥接 Strict Preflight Review

## 结论

通过。当前 OpenSpec 修订与 Superpowers 实施计划已覆盖 2026-07-11 Task 4 preflight 的协议阻断，并把实现边界收敛为：Java 保持 Codex app-server turn 和 JSON-RPC responder；TS Runtime 独占工具校验、策略、人工审批与执行；Java 仅在严格身份校验后把 TS 终态翻译为 `DynamicToolCallResponse`。允许进入 Task 4.1 TDD 实现，不允许跳过 RED、切片验证或 strict 实现 Review。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [backend-gateway spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Superpowers implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Task 4 protocol-blocking review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-11-chatgpt-oauth-task4-preflight-review.md)
- [Java model contracts](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [TS AgentExecutionRunner](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)
- [TS Java client](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/javaClient.ts)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)

评审绑定的关键制品 SHA-256：design `0f18ce5fa0f834990c360850a173758a1067e5363984953a0f637cd21d33340a`，plan `867f12850be12fc68d73ef6358f0fb2c9677507b9fe375d277f742d4004250b4`。任一制品变化均使本次 Preflight 失效，必须重新评审。

## 主要发现

### 已关闭：app-server turn 与 TS 工具生命周期不兼容

修订后的合同不再把 `item/tool/call` 当作已完成模型响应。`ModelChatResponse.pendingTurn` 让 Java HTTP 调用返回时仍保留同一 app-server turn；TS 完成现有审批/执行链后调用内部结果端点，Java 才响应原 JSON-RPC server request。顺序工具调用继续停留在同一 model step，禁止发起不相关的第二个模型 turn。

### 已关闭：Java 绕过策略或自动批准

OpenSpec 和计划均明确禁止 Codex client、pending registry、controller 注入工具执行、策略、MCP 或审批依赖。非 `ok` 结果只能映射为 `success=false`，无 TS 结果必须超时/取消，不能合成成功。Task 4.6 包含依赖负向搜索与 distinct strict implementation Review。

### 已关闭：跨租户回填、重复回填和竞态

结果/取消绑定 service token 及 tenant、user、request、conversation、thread、turn、call、bridge 全部标识；第一份合法 payload 原子获胜，相同重试返回缓存结果，不同重试返回冲突，取消与完成竞态只允许一个终态。跨身份失败不得泄露 pending turn 是否存在。

### 已关闭：超时、断线与重启恢复歧义

计划覆盖 pending deadline、TS deadline 更短、精确 turn interrupt、模糊 HTTP 结果同 payload 重试、不可确认的 app-server 接收状态 fail closed、内存 responder 不重建、restart 后 `BRIDGE_TURN_GONE`，并禁止自动重执行工具或无关联续跑。

### 已关闭：敏感数据与重复会话历史

pending arguments/results、bridge id、Authorization/OAuth-like 值和 app-server error body 不得进入日志、trace、报告、runtime persistence 或 Frontend。pending stub 与工具结果属于 transport-only，不写 conversation history；只在 bridge 完成后写最终 assistant response，避免下一轮上下文重复。

### 非阻塞风险

- Java 内存 pending turn 意味着进程重启会中断在途 Codex turn；这是明确的 fail-closed v1 取舍，不是恢复承诺。
- v1 仅回填 bounded/redacted `inputText`，不支持动态工具 `inputImage`；若未来需要图片结果，必须另行扩展合同。
- 严格安全证据仍需由 Task 4 实现产生；本次 PASS 只授权执行，不代表生产闭环或 Gate C 通过。

## 最终建议

从 Task 4.1 开始按计划执行：先锁定 shared-schema one-of 合同，再完成 app-server client、pending registry、authenticated controller，最后接入 TS AgentExecutionRunner。每一切片保持 RED → GREEN；Task 4.6 的完整矩阵、secret-canary、负向依赖搜索和 distinct strict implementation Review 全部通过后，才允许进入 Task 5 provider wiring。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 保持 active/proposed；本次是已批准设计的合同修订，不归档。
- Task 4 生产实现必须进入计划指定的隔离 worktree；dirty main worktree 仅保留本次合同、dashboard、计划和 review 修订。
- Evidence profile 保持 strict；fake fixture 不能替代明确授权的 real OAuth smoke。
- Task 4 之后必须落盘独立 implementation review；任何 finding 均回到同一切片修复、复验、复审。
- 不允许 Java 执行/批准工具，不允许读取 Codex credential 文件，不允许 silent fallback，不允许未经用户授权的 git add/commit/push/archive。
- 本次未修改项目规则。

## Preflight 验证

- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：PASS；仅出现无法连接 PostHog telemetry 的非阻塞网络告警。
- `pnpm dashboard:check`：PASS；dashboard 生成产物为 current。
- `git diff --check`：PASS。
- placeholder/coverage 自审：PASS；Task 4.1-4.6 覆盖 shared contract、same-turn continuation、身份鉴权、TS ownership、timeout/cancel/idempotency/restart/redaction、负向搜索和 Review loop。
