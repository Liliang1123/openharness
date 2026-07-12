# ChatGPT/Codex OAuth Task 4.2 Medium Brief

## 目标

仅实现已批准计划的 Task 4.2：Java 通过本机 Codex app-server JSONL/JSON-RPC 连接启动一个 thread/turn，在同一 reader loop 中聚合 assistant delta、reasoning 与 usage；收到 `item/tool/call` server request 时保留 responder，返回 pending handle，并在调用方提交终态后写入恰好一个 `DynamicToolCallResponse`，继续读取同一 turn 直至下一 pending、final 或 error。

## 批准依据

- [OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- [Task 4 implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Task 4.1 PASS review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-06-review.md)
- [Protocol spike](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-10-chatgpt-oauth-app-server-protocol-spike-review.md)

## 允许修改

- 新增 [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- 新增 [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- 本 Brief。
- 经用户授权迁入本 worktree 的既有 Task 2/3 制品仅作为基线，不在本切片改写。

## 合同与边界

- 传输只接受注入的本机双向流；本切片不启动真实 Codex、不读取凭据。
- 一个 client 只允许一个 active turn；所有 client request 使用递增 request id 和 responder table 关联响应。
- `startTurn` 发送 `thread/start`，取得 thread id 后发送 `turn/start`；返回 final、pending 或结构化 transport error。
- assistant delta、reasoning delta 按到达顺序有界聚合；usage 只接受非负整数。
- `item/tool/call` 必须含 server request id、thread/turn/call id、tool name 和 canonical JSON object arguments；在 resume 前不完成 turn。
- `resumeToolCall` 必须匹配 pending call，只能调用一次。`ok` 映射 `success=true`；`error|rejected|timeout` 映射 `success=false`。
- DynamicToolCallResponse 仅发出一个 bounded `inputText` content item；对敏感文本做固定 redaction，拒绝 `inputImage`。
- 未知通知可忽略；未知 server request、malformed JSON/frame、auth JSON-RPC error、EOF 或 correlation drift 必须 fail closed，异常不得携带原始 frame/error body。
- 不接受 tool executor、policy service、approval token、shell、MCP 或 HTTP controller 依赖。

## TDD 与验收

1. RED fake peer tests：sync final、stream aggregation、reasoning、usage、pending/resume、失败 status、重复 resume、inputImage、malformed frame、auth error、correlation mismatch、secret redaction。
2. RED 命令：`mvn -o -f backend/pom.xml -Dtest=CodexAppServerClientTest test`，必须因 client 缺失失败。
3. GREEN：实现最小 client，不实现 Task 4.3 registry/controller。
4. Focused：`mvn -o -f backend/pom.xml -Dtest=CodexAppServerClientTest test`。
5. Slice：`mvn -o -f backend/pom.xml -Dtest=CodexProcessSupervisorTest,CodexAppServerClientTest test`。
6. Fresh critical：Java full、OpenSpec strict、`git diff --check`、负向依赖搜索。

## 停止条件

- 需要真实 Provider/credential 才能测试。
- 需要修改 shared schema、registry、controller、Adapter 或 TS Runtime。
- fake protocol 无法证明同一 server-request responder 只写一次。
- raw arguments/results/error frame/Authorization-like canary 进入异常或日志。

## Rollback

仅通过审查后的 inverse patch 删除本 Task 4.2 新增 client/test/Brief；不得回滚或重写已通过的 Task 2、Task 3、Task 4.1 制品。
