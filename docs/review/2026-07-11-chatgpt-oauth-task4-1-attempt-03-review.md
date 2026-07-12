# ChatGPT/Codex OAuth Task 4.1 Attempt 03 Review

## 结论

需修改。Attempt 02 的深嵌套栈溢出、Java record 边界和 API-key message cost 回归覆盖均已修复，fresh critical 全部通过；但 High 独立跨语言 probe 证明 TS 与 Java canonical number validator 对最小正 subnormal double 的规范拼写不一致。Task 4.1 尚未达到共享 wire contract 等价性，禁止进入 Task 4.2。

## Review 范围

- [Task 4.1 实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Backend Gateway spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [ModelController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelController tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## 主要发现

### 高：TS 与 Java 对 subnormal canonical number 的判定相反

TS validator 使用 `JSON.stringify(Number(token)) === token`，因此接受 `{"value":5e-324}` 并拒绝 `{"value":4.9e-324}`。Java validator 使用 `Double.parseDouble`、`BigDecimal.valueOf` 和自定义 `javascriptNumber`，因此接受 `{"value":4.9e-324}` 并拒绝 `{"value":5e-324}`。

High 在系统临时目录创建独立 TS/Java probe，分别运行 Vitest 与编译后的 Java contract。两个 probe 均明确确认上述相反判定，随后已删除临时源码；未修改 worktree 实现。该偏差意味着 TS 认可并发送的合法 canonical arguments 可能被 Java mirror 拒绝，也证明当前“两个等价实现”的数字格式算法尚未等价。

修复要求：在同一 correction scope 内，使 Java number canonicalization 与 TS 所采用的 ECMAScript `JSON.stringify` 语义一致，至少加入 `5e-324` / `4.9e-324` 的镜像正负例；再补一组共享数字边界向量覆盖 subnormal、最小 normal、`1e-7`/`1e-6`、`1e20`/`1e21`、最大 finite 与 rounding 边界。不要通过放宽为“两种拼写均接受”、跳过 Java number 校验或改变 Task 4.1 wire contract 来绕过一致性要求。

## 已确认修复

- 12,000 层、约 24 KiB 输入不再使 TS `safeParse()` 抛出异常；正式回归测试保留。
- 128 层总 nesting 接受、129 层拒绝；字符串内部的大量括号与转义不计入 nesting。
- Java compact constructors 已覆盖 identifier/content、status、UTC 秒/毫秒、canonical object、重复键、lone surrogate、负零、溢出和 nesting bound。
- API-key message cost 测试已恢复，pending continuation cost 测试独立保留。
- actual diff 未发现 Task 4.2 client/registry/controller 实现或 OpenSpec checkbox 越权。

## Fresh 验证

- `pnpm --filter @openharness/shared-schema test`：56/56 PASS，exit 0。
- `pnpm typecheck`：shared-schema、agent-runtime、frontend 全部 PASS，exit 0。
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,ModelControllerTest test`：5/5 PASS，exit 0。
- `mvn -o -f backend/pom.xml test`：49/49 PASS，exit 0。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：valid，exit 0；仅 PostHog telemetry DNS warning。
- `git diff --check`：PASS，exit 0。
- High TS 独立 probe：3/3 PASS，覆盖 128/129 层、字符串括号/转义、canonical 数字/Unicode、2,000 个确定性畸形 bounded 输入不抛异常。
- High Java 独立 probe：exit 0，确认深度/字符串边界，并复现 subnormal 拼写与 TS 相反。

## 最终建议

仅执行 Task 4.1 Attempt 04 canonical number correction：修复 Java/TS subnormal 与边界数字一致性，加入镜像向量，然后重跑 shared-schema、全仓 typecheck、Java focused/full、OpenSpec strict、diff check。不要修改 Task 4.2 文件，不要勾选 OpenSpec 3.4。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 保持 active；无需新增 proposal。
- Task 4.1 Attempt 03 Review FAIL；Task 4.2 禁止开始。
- Attempt 04 必须重新经过 actual diff、fresh critical 与独立跨语言 probe 后才能判定 PASS。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次未修改项目规则、OpenSpec task、dashboard 或实现文件。
