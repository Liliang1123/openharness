# ChatGPT/Codex OAuth Task 4.1 Attempt 06 Review

## 结论

通过。Attempt 06 移除了已证实有缺陷的 `java-json-canonicalization:1.1`，以内嵌、固定 source pin 的 Ryu/ECMAScript formatter 替代；High 已独立核验上游 commit、源文件哈希、Apache-2.0 许可证与适配差异，并用不同 seed 的 5,498,353 个 Node canonical token 验证 Java mirror 零拒绝。共享 fixture、non-canonical twins、全部 fresh critical 与既有安全回归均通过。Task 4.1 正式 PASS，Task 4.2 门禁开放，但本次未开始 Task 4.2、未勾 OpenSpec 3.4。

## Review 范围

- [Attempt 05 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-05-review.md)
- [Attempt 06 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-06-correction-brief.md)
- [Task 4 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [Shared ECMAScript number fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/resources/ecmascript-canonical-numbers.tsv)
- [ModelController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelController tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## 主要发现

无阻塞或需修改 finding。

### Source pin 与许可证核验

- 固定上游为 [cyberphone/json-canonicalization commit 19d51d7](https://github.com/cyberphone/json-canonicalization/commit/19d51d7fe467d4706a3ff08adf8a748f29fc21e0)。
- 上游 `DoubleCoreSerializer.java` SHA-256 独立下载核验为 `61246c838dbfdf372ca7955768695dffe3ffeabb09a8739dbb1bc2245a7561d7`，与代码注释及 Report 一致。
- [上游仓库](https://github.com/cyberphone/json-canonicalization) 与固定 commit 的 LICENSE 均声明 Apache-2.0；内嵌代码保留 copyright、修改说明和许可证头。
- 对上游类与内嵌类做规范化 diff：除类嵌套/命名、`serialize` 访问级别和一处注释空白外，算法体无差异。
- 旧 Maven formatter dependency 已完全移除；fresh dependency tree 对旧坐标无匹配，生产 transitive 为 0。

### 非自引用 oracle 核验

- [Shared ECMAScript number fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/resources/ecmascript-canonical-numbers.tsv) SHA-256 为 `90c2fc3249a5e1ef1ed49dab15fffeeca2de58c8fd2acc806a835e619bb748cd`。
- fixture 含 1,034 个 canonical raw-bit/token pair；TS 对每个 raw bits 重新执行 `JSON.stringify` 并比较 token，Java 独立消费相同 token。
- TS 与 Java 均接受 1,034 个 canonical token、拒绝 1,034 个同值 non-canonical twins。
- 固定回归包括 `±1e-320`，`±1.0e-320` 继续拒绝；Attempt 02–05 的深度、Unicode、重复键、负零、溢出、UTC、record bounds 与 cost 回归保持通过。

## High 独立 probe

High 使用与 Attempt 06 Report 不同的 seed，由 Node `JSON.stringify` 生成 token，Java 只调用编译后的 `PendingCodexTurn` 合同验收：

- 连续正负低位 subnormal raw bits：2,000,000 个候选。
- 确定性随机 raw bit patterns：3,500,000 个候选。
- finite/nonzero canonical 实际 checked：5,498,353；Java rejected：0。
- 每 13 项抽取同值 non-canonical twin：422,950；Java incorrectly accepted：0。
- probe exit 0；所有临时源码、class 与上游下载文件均已删除。

## Fresh 验证

- `pnpm --filter @openharness/shared-schema test`：58/58 PASS，exit 0。
- `pnpm typecheck`：shared-schema、agent-runtime、frontend 全部 PASS，exit 0。
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,ModelControllerTest test`：7/7 PASS，exit 0。
- `mvn -o -f backend/pom.xml test`：51/51 PASS，exit 0。
- 旧 formatter dependency tree 查询：无匹配，exit 0。
- `DO_NOT_TRACK=1 npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：valid，exit 0。
- `git diff --check`：无输出，exit 0。

## 最终建议

接受 Attempt 06 作为 Task 4.1 最终实现。后续若升级 source pin、修改 formatter 或调整 canonical number contract，必须重新生成并审计共享 fixture，并重跑独立跨语言大 corpus。内嵌实现增加了合同文件体积，但相较外部旧制品，它提供了可固定、可离线构建且已验证的算法边界；该维护成本当前可接受。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 继续保持 active；无需新增 proposal。
- Task 4.1 PASS；Task 4.2 现在可以依据既有批准计划进入独立 Medium 实施与 Review。
- OpenSpec 3.4 仍保持未完成，直至对应完整任务满足其验收条件。
- 不因 Task 4.1 PASS 自动授权读取 OAuth credential、执行真实 Provider 调用或跳过后续 Task Review。
- 本次仅新增 Review；未修改项目规则、OpenSpec tasks、dashboard 或实现文件，未执行任何 Git 写操作。
