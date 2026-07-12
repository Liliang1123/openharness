# ChatGPT/Codex OAuth Task 4.1 Attempt 04 Review

## 结论

需修改。Attempt 04 修复了 `Double.MIN_VALUE` 的 `5e-324` 拼写并通过固定镜像向量与全部 fresh critical；但 High 扩展跨语言 probe 在 1,559,513 个 ECMAScript canonical double token 中发现 14 个 Java mirror 拒绝项，集中在低位 subnormal。当前 Java formatter 仍不是完整的 ECMAScript number serialization 实现，Task 4.1 不得 PASS，Task 4.2 继续禁止开始。

## Review 范围

- [Attempt 03 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-03-review.md)
- [Attempt 04 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-04-correction-brief.md)
- [Task 4 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [ModelController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelController tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## 主要发现

### 高：低位 subnormal 仍存在 ECMAScript/Java canonical 拼写漂移

[Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java) 的 `javascriptNumber` 仅对 `±Double.MIN_VALUE` 特判为 `±5e-324`，其余值继续依赖 `BigDecimal.valueOf(value).stripTrailingZeros()`。该策略通过了固定向量，但不是 ECMAScript 最短 round-trip number serialization 的完整实现。

High 使用确定性 bit-pattern corpus 生成 ECMAScript `JSON.stringify` token，并交给编译后的 Java `PendingCodexTurn` mirror 验证：

- 第一轮 99,942 个随机 finite double：0 拒绝。
- 扩展轮 1,559,513 个 token：包含 1,000,000 个随机 bit pattern、正负低位 subnormal 连续区间，以及 `1e-7`、`1e-6`、`1e20`、`1e21` 正负相邻 ULP；Java 拒绝 14 个 ECMAScript canonical token。
- 复现实例包括 `±1e-323`、`±5e-323`、`±6e-323`、`±7e-323`、`±8e-323`、`±9e-323`。
- 独立 TS probe 对 `±1e-323`、`±5e-323`、`±9e-323` 6 个实例全部接受，1/1 test PASS。

因此 TS 可合法发送而 Java mirror 会拒绝的 wire payload 仍然存在。继续逐值添加 special case 会留下不可审计的长尾风险；必须使用完整、可验证的 ECMAScript/RFC 8785 兼容 double-to-string 算法，并以 corpus 防回归。

## 已确认修复

- `5e-324` / `-5e-324` 已被 Java 接受，`4.9e-324` / `-4.9e-324` 被拒绝。
- 固定镜像向量覆盖最小 normal、指数阈值、最大 finite、rounding case 与 `1e23` 差异边界。
- Attempt 03 的深度 bound、Java record 校验、UTC、Unicode、重复键、负零、溢出与 API-key cost 回归保持通过。
- actual diff 未出现 Task 4.2 client/registry/controller 实现或 OpenSpec 3.4 checkbox 越权。

## Fresh 验证

- `pnpm --filter @openharness/shared-schema test`：57/57 PASS，exit 0。
- `pnpm typecheck`：shared-schema、agent-runtime、frontend 全部 PASS，exit 0。
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,ModelControllerTest test`：6/6 PASS，exit 0。
- `mvn -o -f backend/pom.xml test`：50/50 PASS，exit 0。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：valid，exit 0；仅 PostHog DNS telemetry warning。
- `git diff --check`：PASS，exit 0。
- High 扩展 mirror probe：1,559,513 checked，14 rejected，exit 1。
- High TS 最小复现：6 个被 Java 拒绝的 canonical subnormal token 全部接受，1/1 PASS。
- 所有临时 probe 源码、class 和 corpus 文件均已删除。

## 最终建议

仅执行 Task 4.1 Attempt 05 canonical number correction：用完整 ECMAScript/RFC 8785 兼容实现替换 `BigDecimal.valueOf` 加逐值特判方案；正式测试至少保留低位 subnormal 连续 corpus、固定边界向量和确定性随机 bit-pattern mirror。不得放宽为多种拼写都接受，不得跳过 Java number validation。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 保持 active；无需新增 proposal。
- Task 4.1 Attempt 04 Review FAIL；Task 4.2 禁止开始，OpenSpec 3.4 保持未完成。
- Attempt 05 必须重新经过 actual diff、fresh critical 与 High 独立跨语言 corpus probe。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次未修改项目规则、OpenSpec tasks、dashboard 或实现文件。
