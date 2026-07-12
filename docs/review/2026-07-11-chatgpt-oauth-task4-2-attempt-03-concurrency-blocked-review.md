# Task 4.2 Attempt 03 High Review Concurrency Audit

## 结论

有风险。Attempt-03 High Review 因实现与测试在 Review 进行期间被外部并发修改而暂停，当前不能给出 PASS 或 FAIL 的稳定实现结论。首次读取时 client/test SHA 仍与 attempt-02 相同且没有 duplicate-key client 测试；随后 focused 运行发现第 16 个 RED 测试已进入 worktree，而生产 client 尚未更新，命令以 1 error 失败；命令结束后 client 又被更新为 strict duplicate-detection parser。必须由写入方确认停止并提供稳定 SHA，再从当前最终快照重新执行完整 High Review。

## Review 范围

- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Attempt-02 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-attempt-02-high-review.md)
- 仓库外独立探针：[Task42HighRereviewProbe.java](file:///tmp/Task42HighRereviewProbe.java)。

## 主要发现

### 高：Review 期间发生重叠文件并发写入

Review 首次读取观察到：

- client SHA：`e1e1637ac5652569b78f191bd65148f5f18d984a41f4776a9a871e953f4d94e8`。
- test SHA：`94973aba11851c32ee94c8bdc7a67964563323bd3a228efaffb9770e7a954d3f`。
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java) 仍使用普通 `new ObjectMapper()`。
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java) 当时仍为 15 tests，未搜索到完整 frame duplicate-key 用例。

随后 focused 命令实际编译出 16 个 client tests，其中 `rejectsDuplicateArgumentKeysInCompleteJsonlFrameWithoutLeakingContent` 因实际返回 `PendingToolCall` 而不是 `ErrorTurn` 产生 `ClassCastException`；总计 22 tests、1 error、exit 1。命令结束后再次审计发现：

- client SHA 已变为 `112cbf17166197cd2b47d315888544a45ff7b3daa01fa05664936f58a2ea42e3`，mtime 为 `2026-07-11 15:01:49 +0800`。
- test SHA 已变为 `436efebf5b4dab729513f48e40c7c2cfd339b22d3a9f489cc64f05d297acbb63`，mtime 为 `2026-07-11 15:01:33 +0800`。
- client 当前已配置 `StreamReadFeature.STRICT_DUPLICATE_DETECTION`，但该版本尚未经过本次 Review 的任何 fresh focused/full/独立探针验证。

因此用户提交的 DONE_WITH_CONCERNS Report、首次读取快照、focused 执行快照和当前快照不是同一 revision，任何 PASS 判断都会混合不同版本证据。

## 最终建议

1. 外部写入方停止修改三个重叠文件并确认最终 SHA-256。
2. 不复用本次中间态 focused 失败作为最终实现结论；它只证明 TDD RED 与并发时序。
3. 稳定后从头运行 duplicate-key 独立探针、全部原 finding 探针、client focused、client+supervisor、Contracts+client+supervisor、Java full、OpenSpec strict、`git diff --check` 与禁止依赖搜索。
4. 使用稳定 SHA 新建 attempt-04 High Review；不得覆盖本审计或之前 Review。

## 后续门禁

- OpenSpec：无需新增 change；继续使用已批准 [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)。
- Task 4.2 checkbox：保持未勾选。
- Dashboard：不得同步为 verified。
- 实现：在写入方确认稳定前，Reviewer 不再运行或修改实现文件。
- 项目规则：未修改。
