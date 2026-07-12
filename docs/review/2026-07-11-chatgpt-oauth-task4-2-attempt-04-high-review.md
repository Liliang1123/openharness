# ChatGPT/Codex OAuth Task 4.2 Attempt 04 High Review

## 结论

通过。Task 4.2 Medium Brief 的实现边界、首轮 High Review 五项 finding 与 attempt-02 duplicate-key finding 均已关闭；稳定 SHA 在 Review 前后完全一致。独立对抗探针 7/7 PASS，focused 27/27、Java full 95/95、OpenSpec strict、whitespace 与禁止依赖门禁全部通过。Task 4.2 切片可以进入 checkbox/下一切片协调，但本结论不代表整个 `add-chatgpt-oauth-auth` change 完成，也不授权真实 OAuth/provider、归档、提交或 dashboard verified 状态。

## Review 范围

- [Task 4.2 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-medium-brief.md)
- [首轮 Task 4.2 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-high-review.md)
- [Attempt-02 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-attempt-02-high-review.md)
- [Attempt-03 concurrency audit](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-attempt-03-concurrency-blocked-review.md)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [ContractsTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- 当前 worktree 的完整 diff、status、SHA-256、focused/full/OpenSpec/whitespace/禁止依赖证据。
- 仓库外独立探针：[Task42HighRereviewProbe.java](file:///tmp/Task42HighRereviewProbe.java)。该文件不属于项目制品。

## 主要发现

无未关闭的 actionable finding。

### Arguments canonicalization 与 duplicate-key fail-closed

[Contracts.java:22](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java#L22) 提供共享 canonical serializer，复用 Task 4.1 的 canonical string、ECMAScript number formatter 与最终 validator。[CodexAppServerClient.java:33](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L33) 在首次完整 frame 解析即启用 `STRICT_DUPLICATE_DETECTION`；重复 key 在进入业务分派前转换为固定脱敏 `PROTOCOL_FAILURE`，不会被覆盖为后值。

正式测试覆盖 unordered/nested object、escaping、`1e-320`、非 object、超界与完整 frame duplicate key。独立探针验证 canonical 输出与 duplicate-key fail-closed 均通过。

### Responder exactly-once 与 sequential continuation

[CodexAppServerClient.java:82](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L82) 的 per-turn responder reservation 在首次回答前后均拒绝重复 ID；[CodexAppServerClient.java:282](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L282) 在 pending 入队前执行 reservation。独立探针确认重复 ID 只产生一个 response，不同 ID 的 sequential calls 继续同一 turn 并到达 final。

### Usage、empty content 与 write failure

- [CodexAppServerClient.java:408](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L408) 要求 integral、非负且可转换到 Java int；fractional 等非法 usage fail closed。
- [CodexAppServerClient.java:430](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L430) 接受空但非 null 的 bounded content，同时仍由单 content-item 检查拒绝多个 item 与 inputImage。
- [CodexAppServerClient.java:175](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L175) 将 responder CAS、write 与 continuation wait 置于结构化失败路径；write failure 返回脱敏 ErrorTurn，handle 保持 terminal，不能二次写入。

## 验证记录

- 稳定 client SHA-256：`112cbf17166197cd2b47d315888544a45ff7b3daa01fa05664936f58a2ea42e3`。
- 稳定 client test SHA-256：`436efebf5b4dab729513f48e40c7c2cfd339b22d3a9f489cc64f05d297acbb63`。
- 稳定 Contracts SHA-256：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`。
- 独立 High 探针：canonical、duplicate arguments key、duplicate responder、sequential responder、invalid usage、empty content、write failure，共 7/7 PASS，exit 0。
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexProcessSupervisorTest test`：27/27，exit 0。
- `mvn -o -f backend/pom.xml test`：95/95，exit 0。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：change valid，exit 0；PostHog flush 网络 warning 不影响本地校验。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，`rg` exit 1，符合预期。
- Review 结束前重新计算三文件 SHA，与开始快照完全一致。

## 残余风险

- app-server v2/experimental protocol 仍可能随 CLI 版本变化；Task 4.2 只由版本对齐的 fake peer 与生成 schema 验证。
- 真实 OAuth/provider qualification 不属于本切片，mock/fake PASS 不关闭 Gate C。
- Task 4.3 的 identity、timeout/cancel、replay/conflict、restart orphan registry，后续 controller 与 TS bridge 均未实现，不能由本 Review 推断完成。

## 最终建议

1. 保留本次稳定 SHA，避免下一切片重写已通过的 Task 4.2 client/contract/test。
2. 由控制面按计划协调 Task 4.2 对应 checkbox；不要把单切片 PASS 解释为整个 OpenSpec change verified。
3. 进入 Task 4.3 前创建当前 revision 的独立 Brief/Preflight，严格限制 registry 状态机范围，不重复实现 client canonicalization 或 responder transport。

## 后续门禁

- OpenSpec：无需新增 change；继续受已批准 [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth) 约束。
- Superpowers：Task 4.3 必须使用新的切片 Brief、TDD 与独立 High Review。
- Dashboard：整个 change 尚未达到 verified，不同步 verified 状态。
- 真实 OAuth/provider：仍需单独人工授权与真实 qualification。
- Git：本 Review 不授权 add、commit、push、reset、clean、archive。
