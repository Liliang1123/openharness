# ChatGPT/Codex OAuth Task 4.2 High Review

## 结论

需修改。既有 focused、slice、Java full、OpenSpec strict、whitespace 与禁止依赖门禁均通过，且 Task 4.2 实现未越界接入 registry、controller、tool executor、policy、shell 或 MCP；但独立对抗探针复现了四个合同失败，静态追踪另发现一个结构化错误路径缺口。当前不得将 Task 4.2 标记为 PASS，不得更新 OpenSpec checkbox 或 dashboard。

## Review 范围

- [Task 4.2 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-medium-brief.md)
- [批准的实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [backend-gateway spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [协议 Spike Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-10-chatgpt-oauth-app-server-protocol-spike-review.md)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Task 4.1 Java contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Task 4.1 shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- 当前 worktree 的完整 tracked diff、untracked Task 2/3/4.1/4.2 基线与 `git status --short`。
- 仓库外独立探针：[Task42HighReviewProbe.java](file:///tmp/Task42HighReviewProbe.java)。该文件仅用于本次 Review，不属于项目制品。

## 主要发现

### 高：合法 app-server arguments object 未被规范化，真实工具调用可被错误拒绝

[CodexAppServerClient.java:267](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L267) 直接使用 Jackson `writeValueAsString` 保留收到的 object key 顺序，然后通过构造 `PendingCodexTurn` 间接要求 Task 4.1 的 canonical JSON。官方生成的 `item/tool/call` schema 仅要求 `arguments` 为 JSON value，不承诺 JCS key 顺序或 canonical number/string spelling。独立探针发送合法 `{"z":1,"a":2}`，实现返回 `ErrorTurn[code=PROTOCOL_FAILURE]`，而不是产生 canonical `{"a":2,"z":1}` 的 pending handle。

这会让符合 app-server schema 的多字段工具参数因序列化顺序不同而失败，违反 Brief 的“canonical JSON object arguments”输出合同。修复必须在 Java client 边界对解析后的 object 做与 Task 4.1 一致的 canonical serialization，而不是要求实验性 server 暗含未声明的排序保证。补充 unordered keys、nested object、canonical number/string、超界与非-object 回归。

### 高：同一 server responder id 可以被写入两次

[CodexAppServerClient.java:267](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L267) 仅保存当前 `PendingState`；[CodexAppServerClient.java:279](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L279) 在前一 pending 已 answered 后允许任意新 server request，没有记录 responder id 已消费集合。独立探针让 server 在第一次 id `77` 已响应后再次发送 id `77`，client 随后实际写出 `77,77` 两个 `DynamicToolCallResponse` 并正常返回 final。

这直接违反 Brief 的“同一 server-request responder 只写一次”与 fail-closed 要求。修复应为 server responder 建立按 turn 有界的 reserved/answered 状态，重复 id 在进入 pending queue 前即关闭当前 turn；同时覆盖重复发生在首次回答前、回答后，以及不同 id 的合法 sequential calls。

### 中：浮点 token usage 被静默截断为整数

[CodexAppServerClient.java:392](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L392) 使用 `canConvertToInt()` 加 `intValue()`；Jackson 对 `1.5` 可转换到 int，随后被截断为 `1`。独立探针发送 `inputTokens: 1.5`，实现返回正常 `FinalTurn` 且 usage 为 `1`。这违反 Brief 的“usage 只接受非负整数”。

修复应显式要求 JSON integral number、非负且在 int 范围内；为 fractional、negative、overflow、missing、string 与合法边界增加回归。

### 中：Task 4.1 允许的空 terminal content 被 Task 4.2 拒绝

[Contracts.java:147](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java#L147) 与 [shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts) 都允许长度为 0 的 tool-result `content`；但 [CodexAppServerClient.java:155](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L155) 复用 `requireBounded`，把空字符串视为非法。独立探针以合法 `status=error`、空 `inputText` 恢复 pending，得到 `IllegalArgumentException: content text must be bounded text`，server request 保持未响应。

在不修改已批准 Task 4.1 合同的前提下，Task 4.2 应接受空但非 null 的 bounded content，并仍输出恰好一个 `inputText`。若产品要禁止空 content，必须先修改 OpenSpec/Task 4.1 契约及双端 schema，而不能由 client 私自收紧。

### 中：responder 写出失败绕过结构化 ErrorTurn，并把 handle 标记为已回答

[CodexAppServerClient.java:158](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L158) 先将 `answered` CAS 为 true，[CodexAppServerClient.java:163](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L163) 再在 `try` 块之外调用 `writeFrame`。若 transport 在此处关闭，调用方收到裸 `IllegalStateException`，而非 Brief 要求的下一 pending/final/error；同一 handle 又因 answered=true 无法重试。

修复应把 write 与后续等待纳入结构化失败路径；对“本地写失败”和“写出是否到达 server 不确定”的状态都 fail closed，关闭当前 turn，返回脱敏 `ErrorTurn`，且不得通过重试产生第二次 responder 写入。补充关闭 output/抛出 IOException 的回归。

## 正向证据与验证记录

- 当前实现 SHA-256：`298a5cf0ad3b5facfbcc99f51ce5d8e39660625d4762690eea9d0aa35c52171e`。
- 当前测试 SHA-256：`4d815ee64abdfd733d9dbc724efee1d13e594d71aa7122ff6c59e22f0533a049`。
- `mvn -o -f backend/pom.xml -Dtest=CodexProcessSupervisorTest,CodexAppServerClientTest test`：14/14，exit 0。
- `mvn -o -f backend/pom.xml test`：87/87，exit 0。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：change valid，exit 0；PostHog flush 因受限网络失败是非门禁 telemetry warning。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，`rg` exit 1，符合预期。
- 独立探针编译与执行：exit 0，但业务断言观察到 `nonCanonicalArguments=PROTOCOL_FAILURE`、`fractionalUsage` 被截断为 1、`duplicateResponderWrites=77,77`、空 content 被 `IllegalArgumentException` 拒绝；因此 Review FAIL。
- 实现确有单 reader thread、递增 client request id、client responder table、initialize/thread/start/turn/start、delta/reasoning/usage 聚合、pending/resume、status 映射、单 inputText、inputImage 拒绝、基础 malformed/auth/correlation fail-closed 与敏感文本脱敏机制。

## 最终建议

1. 保持 Task 4.2 切片，不进入 Task 4.3；只修改 [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java) 与 [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)。
2. 先把上述五项转成 RED fake-peer tests，再做最小修复；canonicalization 必须复用或抽取 Task 4.1 已验证语义，禁止复制一个产生不同结果的第二套算法。
3. 修复 responder 状态时保持合法 sequential tool calls，同一 turn 不得启动第二个 model turn；不要把 Task 4.3 的 identity/replay/expiry registry 提前塞入 client。
4. 修复后刷新 focused、client+supervisor、Java full、OpenSpec strict、`git diff --check`、禁止依赖搜索及独立对抗探针，再提交新的 High Review。

## 后续门禁

- OpenSpec：无需新增 change；继续受已批准 [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth) 约束。
- Superpowers：必须按 TDD 执行同一切片的 fix → verify → High Review 循环。
- Task 4.2 checkbox：保持未勾选，直至所有发现关闭且新的 High Review 为 PASS。
- Dashboard：当前不得同步为 verified。
- 人工审批：不需要真实 OAuth/provider、凭据或生产授权；若修复需要改变 Task 4.1 schema/OpenSpec 合同，必须先停止并请求新的范围批准。
