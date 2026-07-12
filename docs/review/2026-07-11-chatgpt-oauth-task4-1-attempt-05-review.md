# ChatGPT/Codex OAuth Task 4.1 Attempt 05 Review

## 结论

需修改。Attempt 05 移除了逐值 special case，并引入 RFC 8785 所列 Java 参考实现；依赖版本、哈希、许可证、依赖树及全部 fresh critical 均核验通过。但 High 的独立 Node-to-Java corpus 在 3,198,951 个 ECMAScript canonical token 中发现 `1e-320` 与 `-1e-320` 两个 Java mirror 拒绝项。固定版本 `java-json-canonicalization:1.1` 对相应 double 输出错误 token，因此 Task 4.1 仍不得 PASS，Task 4.2 继续禁止开始。

## Review 范围

- [Attempt 04 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-04-review.md)
- [Attempt 05 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-05-correction-brief.md)
- [Task 4 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- [Backend Maven configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/pom.xml)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [ModelController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelController tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## 主要发现

### 高：固定依赖 1.1 对 `±1e-320` 不满足 ECMAScript number serialization

[Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java) 直接以 `NumberToJSON.serializeNumber(double)` 作为 Java canonical oracle。High 独立 probe 由 Node `JSON.stringify` 生成 token，Java 只调用编译后的 `PendingCodexTurn` 合同验收，不使用该依赖生成期望值：

- canonical checked：3,198,951；rejected：2。
- rejected token：`1e-320`、`-1e-320`。
- 对应 raw double bits：`0x00000000000007e8`、`0x80000000000007e8`。
- `NumberToJSON.serializeNumber` 对正值实际输出 `0.0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001e-178`，负值同样错误；它们不等于 ECMAScript token `±1e-320`。
- 从相同 Node corpus 每 16 项抽取一个同值 non-canonical twin，共 199,934 项；Java 错误接受 0。

因此当前 wire contract 仍存在 TS 合法发送、Java mirror 拒绝的确定性 payload。Attempt 05 的 Java corpus 以 `NumberToJSON.serializeNumber` 同时生成 token 和校验期望，属于自引用测试，无法发现该互操作缺口；TS 与 Java 分别断言相同 bit-pattern 数量也不能证明两端 token 一致。

[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) 要求使用 ECMAScript number serialization，并在附录列出该 Java 项目作为兼容实现；[上游 Java 实现](https://github.com/erdtman/java-json-canonicalization) 也声明 RFC 8785 与 Apache-2.0。上述来源能支持算法选择方向，但不能替代对固定制品 `1.1` 的实际 corpus 验证。

## 已确认修复与供应链核验

- Attempt 04 的 `±1e-323`、`±5e-323` 至 `±9e-323` 已通过固定回归。
- 依赖固定为 `io.github.erdtman:java-json-canonicalization:1.1:compile`。
- JAR SHA-256：`ed12a01f28d147898312963a1f704e90290b67a61f34fa3a761f41c134f4e691`。
- POM SHA-256：`37114938a89def00596ff5541b794abc6be626b4c73e988d5a5bd457a3f38477`。
- 本地 POM 声明 Apache License 2.0；唯一列出的 dependency 为 test scope，fresh Maven dependency tree 未见生产 transitive。
- 深度 bound、Unicode、重复键、负零、溢出、UTC、Java record bounds 与 message/pending cost regression 保持通过。
- actual diff 未推进 Task 4.2，未修改 OpenSpec 3.4 checkbox、dashboard 或项目规则。

## Fresh 验证

- `pnpm --filter @openharness/shared-schema test`：58/58 PASS，exit 0。
- `pnpm typecheck`：shared-schema、agent-runtime、frontend 全部 PASS，exit 0。
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,ModelControllerTest test`：7/7 PASS，exit 0。
- `mvn -o -f backend/pom.xml test`：51/51 PASS，exit 0。
- `mvn -o -f backend/pom.xml dependency:tree -Dincludes=io.github.erdtman:java-json-canonicalization`：固定单个 compile dependency 1.1，exit 0。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：valid，exit 0；仅 PostHog DNS telemetry warning。
- `git diff --check`：无输出，exit 0。
- High 独立 Node-to-Java probe：3,198,951 canonical checked，2 rejected；199,934 twins checked，0 incorrectly accepted，exit 1。
- 独立 formatter 最小复现：`±1e-320` 均产生错误 formatter token。
- 所有临时 probe 源码与 class 均已删除。

## 最终建议

仅执行 Task 4.1 Attempt 06：先把 `±1e-320` 加入 TS/Java 固定互操作回归，再替换或修正当前 number formatter。不得添加针对 `0x7e8` 的 special case，也不得把多个同值拼写都视为 canonical。Java 正式 corpus 必须消费独立 ECMAScript oracle token，而不是调用被测 formatter生成期望值；可使用小型持久化共享 fixture 加确定性 High 大 corpus 双层验证。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 保持 active；无需新增 proposal。
- Task 4.1 Attempt 05 Review FAIL；Task 4.2 禁止开始，OpenSpec 3.4 保持未完成。
- Attempt 06 必须重新经过 actual diff、fresh critical、依赖/算法审计与 High 独立 Node-to-Java corpus。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次仅新增 Review 与 correction brief；未修改项目规则、OpenSpec tasks、dashboard 或实现文件。
