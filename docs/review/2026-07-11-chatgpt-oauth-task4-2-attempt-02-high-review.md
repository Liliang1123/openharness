# ChatGPT/Codex OAuth Task 4.2 Attempt 02 High Review

## 结论

需修改。首轮 High Review 的 responder ID、usage、empty content 与 write-failure findings 已关闭，canonical arguments 的排序、嵌套、escaping、ECMAScript number 与输出边界也已通过正式测试和独立探针；但 client 在调用严格 canonicalizer 前先使用普通 Jackson 解析完整 frame，导致原始 arguments 的重复 key 被覆盖。独立探针复现 `{"a":1,"a":2}` 被接受并转换为 `{"a":2}`。canonical finding 因此未完全关闭，Task 4.2 仍不得标记 PASS、更新 OpenSpec checkbox 或同步 dashboard。

## Review 范围

- [Task 4.2 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-medium-brief.md)
- [首轮 Task 4.2 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-high-review.md)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [ContractsTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- 当前 worktree 的完整 diff、SHA-256、focused/full/OpenSpec/whitespace/禁止依赖证据。
- 仓库外独立探针：[Task42HighRereviewProbe.java](file:///tmp/Task42HighRereviewProbe.java)。该文件不属于项目制品。

## 主要发现

### 高：重复 arguments key 在严格 canonical 校验前被静默覆盖

[CodexAppServerClient.java:213](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L213) 使用普通 `ObjectMapper.readTree(frame)` 解析完整 JSONL frame；默认解析不会拒绝重复 object key，后值覆盖前值。[CodexAppServerClient.java:286](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java#L286) 随后把已经丢失重复信息的 `JsonNode` 再序列化，才交给 [Contracts.java:22](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java#L22) 的严格 canonicalizer。因此 canonicalizer 内的 `STRICT_DUPLICATE_DETECTION` 无法观察原始重复 key。

独立探针向 `item/tool/call` 发送 `arguments={"a":1,"a":2}`，预期 fail closed，实际得到 `PendingToolCall(... argumentsRaw={"a":2})`，进程 exit 1。现有 [ContractsTest.java:118](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java#L118) 只证明直接传入 raw duplicate JSON 时 validator 会拒绝，没有覆盖 client 的“普通 frame parse → compact → strict parse”数据链。

这会把歧义输入静默改写成不同的工具参数，并违反 canonical JSON object 与 fail-closed 合同。最小修复应让 client 的首次 frame 解析启用 strict duplicate detection，使重复 key 在任何字段进入业务分派前即成为脱敏 `PROTOCOL_FAILURE`；同时在 client fake-peer 测试中发送真实重复-key frame，不能只直接测试 `Contracts.canonicalizeCodexArguments`。修复不得改成“保留最后值”的兼容行为。

## 已关闭 finding

- Canonical 正常路径：共享 serializer 对 unordered/nested object 排序，复用 Task 4.1 string/ECMAScript-number formatter 与最终 validator；独立探针验证 `1e-320`、嵌套排序和 slash string 后得到预期 canonical text。
- Responder ID：per-turn reserved set 在回答前/后拒绝重复 ID，不写第二次；不同 ID 的 sequential calls 仍在同一 turn 完成。
- Usage：只接受 integral、非负、int 范围内节点；fractional 独立探针返回 `PROTOCOL_FAILURE`。
- Empty content：空但非 null 的单个 `inputText` 可写出并继续到 `FinalTurn`。
- Write failure：CAS、write 与等待位于结构化捕获路径；失败返回脱敏 `TRANSPORT_FAILURE`，第二次 resume 被拒绝。

## 验证记录

- 实现 SHA-256：`e1e1637ac5652569b78f191bd65148f5f18d984a41f4776a9a871e953f4d94e8`。
- client test SHA-256：`94973aba11851c32ee94c8bdc7a67964563323bd3a228efaffb9770e7a954d3f`。
- Contracts SHA-256：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`。
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexProcessSupervisorTest test`：26/26，exit 0。
- `mvn -o -f backend/pom.xml test`：94/94，exit 0。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：change valid，exit 0；PostHog flush 网络 warning 不影响本地验证结论。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，`rg` exit 1，符合预期。
- 原五项独立探针加 sequential control：6/6 PASS。
- 新增 duplicate-key 独立探针：FAIL，exit 1；实际返回 `PendingToolCall` 与 `argumentsRaw={"a":2}`。

## 最终建议

1. 保持 Task 4.2 同一切片，只修改 [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java) 与 [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)；[Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java) 当前共享 canonicalizer 无需继续扩大。
2. 先增加从完整 JSONL frame 进入 client 的 duplicate-key RED，再让首次 frame parser 启用 strict duplicate detection；验证异常消息不含原 frame、key 或 value。
3. GREEN 后刷新 26-test focused、Java full、OpenSpec strict、`git diff --check`、禁止依赖搜索及全部独立探针，再执行 attempt-03 High Review。

## 后续门禁

- OpenSpec：无需新增 change；继续受已批准 [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth) 约束。
- Superpowers：按 TDD 执行同一 finding 的 fix → verify → High Review 循环。
- Task 4.2 checkbox：保持未勾选。
- Dashboard：不得同步为 verified。
- 范围：不得进入 Task 4.3–4.5，不需要真实 OAuth、credential 或 provider 调用。
