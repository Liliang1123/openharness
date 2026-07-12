# ChatGPT/Codex OAuth Task 4.5 High Review

## 结论

通过。Task 4.5 在当前稳定 SHA 上满足同一 model step 内续接 Codex pending turn、TS 独占 policy/approval/tool execution、exact cancel、identical ambiguous retry 以及零稳定 transport payload persistence 的既定契约，可以进入 Task 4.6 安全负向证据与切片总审。

## Review 范围

- [Java client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/javaClient.ts)
- [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/agentExecutionRunner.ts)
- [Approval store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/approvalStore.ts)
- [Codex pending-turn tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/test/codexPendingTurn.test.ts)
- [Approval-store tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/test/approvalStore.test.ts)
- [Task 4.5 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-5-medium-brief.md)
- [Task 4.5 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-5-medium-brief-preflight-review.md)
- [Approved OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)

## 主要发现

### High/Medium findings

无未关闭 High 或 Medium finding。

### 已验证行为

1. `HttpJavaClient` 仅调用固定 authenticated completion/cancel endpoint，并对响应执行共享 `ModelChatResponseSchema` 校验。
2. sequential pending calls 在同一 `stepIndex` 内消费，初始 `chat()` 恰好一次；transport assistant/tool 内容不进入 history。
3. pending call 复用 frozen catalog、agent allow-list、`beforeToolUse`、approval store、MCP/Java/subagent execution 与 trace boundary，没有第二套 executor。
4. terminal status 映射覆盖 `ok`、`rejected`、`timeout`、`error`；单次提交 content 有 65,536 字符上限。
5. abort 与 continuation failure 对 exact thread/turn/call 执行 best-effort cancel；cancel failure不覆盖原 terminal outcome。
6. ambiguous network completion 只允许一次 identical retry；idempotency key 基于 execution/request/call 的 SHA-256 稳定生成。
7. Codex approval payload 仅驻留内存，写盘集合过滤 raw arguments 与 approval token；restart 后不恢复。
8. runtime events/history 对 bridge id、raw arguments、result content 与 Authorization canary 均无稳定泄漏；最终 history 只有 user 与 final assistant。

### RED→GREEN 与 fresh evidence

- Approval persistence RED：canary 实际进入 JSON file，1 failure；GREEN：3/3。
- Pending runner RED：missing completion method、pending response 被当作 empty response，2/2 failures；GREEN focused：31/31。
- Ordinary pipeline regression：12/12。
- Agent Runtime full：64 files、317/317。
- Root `pnpm typecheck`：shared schema、agent runtime、frontend 全部 exit 0。
- OpenSpec strict：valid，exit 0；PostHog 离线 flush warning 非门禁。
- `git diff --check`：无输出，exit 0。
- 独立临时 adversarial probe：1 test、8 assertions PASS；临时文件已删除。

### 稳定 SHA-256

间隔三秒双采样一致，`git status --short` 同步稳定：

- Java client：`391c9a97339b35347d39b4d77723b7907e88642d302235cfdfba2f4cc079e098`
- Runner：`b28c9e434604e82ff758b90ffc801318cff1e479771456852a9ea53fd071e6a8`
- Approval store：`0a7d17928d0e53602e03ec07b5007279366bd5fdd24908e8ad8de49468100bd8`
- Pending tests：`fde7951b76b629cc00b46bcca4459200fb4ce9ae5fd376ce8e84837ce02acedd`
- Approval tests：`10eaf0b8d8b1252efe33c7782a3d5346b2ae7ed623a384bd398f32f52b11ed26`

## 最终建议

接受 Task 4.5。Task 4.6 应在以上 SHA 基线上加入跨 Java/TS 的安全 canary 负向矩阵，复跑 Task 4 全矩阵，并确认 Java client/registry/controller 无 tool execution、policy、approval、MCP、shell 或 credential ownership。

## 后续门禁

- 不需要新增 OpenSpec proposal；本实现属于已批准 change 的 Task 4.5。
- 进入 Task 4.6，完成安全负向证据与独立 slice review PASS 后才能进入 Task 5。
- 本 Review 未修改项目规则、OpenSpec checkbox 或 dashboard，未执行 Git 写操作。
