# ChatGPT/Codex OAuth Task 4.3 Medium Brief

## 状态

可执行，但必须单窗口独占写入。Task 4.2 已由 [Attempt-04 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-attempt-04-high-review.md) 判定 PASS；本切片从该稳定基线继续，不重复 Task 4.1/4.2。

## 目标

仅实现已批准计划的 Task 4.3：新增内存态 `CodexPendingTurnRegistry`，绑定 tenant/user/request/conversation/thread/turn/call/bridge 身份，原子管理 pending、完成、超时、取消、重放冲突、终态保留和 restart orphan。Registry 只协调同一 Codex app-server turn 的 responder，不执行工具、不评估策略、不产生 approval。

## 批准依据与必读文件

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Provider adapter delta spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Backend gateway delta spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Task 4.2 PASS Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-attempt-04-high-review.md)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)

## 允许修改

- 新增 [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- 新增 [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- 仅当 focused RED 明确证明现有 public boundary 无法 fail/interrupt 精确 pending turn 时，允许最小修改 [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java) 及其 [测试](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)；必须记录修改原因并重新运行 Task 4.2 独立 probe 范围。
- 本 Brief 只读，不由实施 Agent 改写。

除上述文件外一律禁止修改。特别禁止修改 Controller、AuthFilter、shared schema、TS Runtime、ProviderRegistry、ModelRouter、OpenSpec、dashboard、项目规则和 Task 4.2 Review。

## 合同与不变量

- `bridgeId` 使用加密安全随机、不透明且有界的标识；不得从 thread/turn/call 或租户信息可逆派生。
- pending record 精确绑定 tenantId、userId、requestId、conversationId、threadId、turnId、callId 与 responder handle；任一 mismatch 不得触发 app-server 写入，也不得泄漏记录是否属于其他身份。
- 每个 turn 同时最多一个 unresolved pending call；非法第二个 pending 必须 fail closed。
- 成功路径只允许 `ACTIVE -> PENDING_TOOL -> ACTIVE|COMPLETED`；`CANCELLING|TIMED_OUT|FAILED|ORPHANED` 为终态。
- 第一个合法 `(bridgeId, callId, idempotencyKey, payloadHash)` 原子获胜并最多写一次 responder。完全相同的 retry 返回缓存的脱敏 continuation，且 `idempotentReplay=true`；不同 key 或 payload 返回 `BRIDGE_RESULT_CONFLICT`，不得二次写入。
- cancel 与 complete 竞态只能有一个 mutation 获胜；loser 返回已记录终态，不得再次调用 client。
- expiry 原子转为 `TIMED_OUT`；若 responder 可写，发送 `success=false`，随后中断精确 turn，并返回结构化 non-fallback error。
- restart 后不得恢复 responder handle；已知旧 bridge 返回 `BRIDGE_TURN_GONE`，不得自动重试工具或启动新 turn。
- terminal retention 有明确上限与 clock 注入；到期删除后 fail closed。保留内容仅限 correlation metadata、payload hash、terminal status、脱敏 response 与 expiry。
- raw arguments、raw result、bridge id、Authorization/OAuth-like canary 不得进入日志、异常、`toString`、终态缓存或测试报告。payload hash 必须使用 canonical terminal submission 的明确字节序列，不能包含 secret 原文。
- Registry 不得依赖 `ToolExecutionService`、`PolicyService`、approval store、MCP、shell、HTTP controller 或 credential/token path。

## TDD 执行顺序

1. 开始写入前记录 `git status --short`，计算 Client/Test/Contracts SHA-256，并等待 3 秒后复算；不一致立即 `BLOCKED`。
2. 先建立 baseline：运行 Task 4.2 focused 与 backend full，要求保持 27/27、95/95 或报告当前仓库实际 fresh 数量且 exit 0。
3. 新增 registry RED tests，至少覆盖：全部 identity 字段逐一 mismatch、bridge mismatch、one-pending-per-turn、timeout、cancel-before-complete、complete-before-cancel、并发 race、identical replay、key conflict、payload conflict、retention expiry、restart orphan、secret canary、clock/bridge-id bounds。
4. RED 命令：`mvn -o -f backend/pom.xml -Dtest=CodexPendingTurnRegistryTest test`。必须因 Registry 缺失或状态行为缺失失败；测试环境/依赖失败不算有效 RED。
5. 实现满足上述状态机的最小代码。不得提前实现 Task 4.4 HTTP endpoint 或 Task 4.5 TS Runtime。
6. GREEN focused：`mvn -o -f backend/pom.xml -Dtest=CodexPendingTurnRegistryTest,CodexAppServerClientTest test`。
7. Race gate：`for i in {1..20}; do mvn -q -o -f backend/pom.xml -Dtest=CodexPendingTurnRegistryTest,CodexAppServerClientTest test || exit 1; done`。
8. Fresh critical：`mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexProcessSupervisorTest,CodexPendingTurnRegistryTest test`、`mvn -o -f backend/pom.xml test`、`npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`、`git diff --check`。
9. 负向依赖搜索：`rg -n "ToolExecutionService|PolicyService|Approval|approve|MCP|ProcessBuilder|credential|token" backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java`；预期无匹配，`rg` exit 1。
10. 完成后再次等待 3 秒并复算所有实际修改文件 SHA；如发生外部漂移，停止并报告 `BLOCKED`。

## 必须输出的实施报告

以 `DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，不得自行声明 Task 4.3 PASS。报告必须包含：actual diff、有效 RED、逐项 GREEN、20 次 race 结果、fresh full/OpenSpec/diff-check/负向搜索、最终 SHA、`git status --short`、并发稳定性、残余风险及下一门禁。实现完成后需要新的独立 High Review，并至少加入一个不复用 focused test 断言的并发/重放对抗 probe。

建议 High Review 落盘到 [Task 4.3 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-high-review.md)。只有该 Review PASS 才能启动 Task 4.4。

## 停止条件

- Task 4.2 三份稳定 SHA 在开始或结束时漂移，或同一文件存在外部并发写入。
- 需要读取凭据、启动真实 Codex/provider、连接非本地端点或执行真实工具。
- 需要修改 Controller、AuthFilter、shared schema、TS Runtime、Provider routing 或公开 API。
- 无法证明 exactly-once、cancel/complete 原子竞争、bounded retention 或 restart orphan fail closed。
- 测试只能靠 sleep/flaky timing 成立，不能通过 injected clock、latch/barrier 或确定性调度证明。
- raw arguments/result/bridge id/canary 出现在异常、日志或终态缓存。

## Git 与回滚边界

不执行 `git add`、`commit`、`push`、`reset`、`clean`、`checkout`、`archive`。不得覆盖既有 dirty worktree 制品。若需回滚，只能提出针对本 Brief 允许文件的 reviewed inverse patch，不得自行执行破坏性 Git 操作。
