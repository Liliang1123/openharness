# ChatGPT/Codex OAuth Task 4.1 Attempt 02 Review

## 结论

需修改。Brief A Report 所列四项 finding 已在代码中得到针对性修复，fresh shared-schema、typecheck 和 Backend full tests 均通过；但 High 主线程的恶意深度探针复现了 bounded input 导致的栈溢出，并发现 Java mirror 边界与既有 API-key 回归覆盖仍不完整。Task 4.1 不得进入 Task 4.2。

## Review 范围

- [Task 4.1 实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Backend Gateway spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [ModelController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelController tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## 主要发现

### 高：bounded canonical JSON 可触发进程栈溢出

`CanonicalJsonParser` 通过 `parseValue -> parseArray/parseObject` 递归处理嵌套。High 主线程使用 12,000 层数组、总长度约 24KiB 的合法边界内输入调用 `PendingCodexTurnSchema.safeParse()`，实际抛出 `RangeError: Maximum call stack size exceeded`。这会把本应安全拒绝的外部 payload 变成未捕获异常。临时探针已在观察 RED 后删除，未留在 worktree。

修复要求：使用迭代 parser，或在任何递归前用明确且测试覆盖的 nesting bound fail closed；`safeParse()` 对所有不超过字段长度上限的输入都不得抛异常。必须保留正式深度回归测试。

### 中：Java mirror records 未锁定同一边界

计划要求 mirror Java records，并约束每个 identifier/content 与 canonical `argumentsRaw`。当前 `PendingCodexTurn`、`CodexToolResultSubmission`、`CodexTurnCancelRequest` 仅声明字段；Java 可构造空/超长 identifier、非法 status/date 和非 canonical arguments。需要 compact constructor 或共享 validator，使 Java 侧至少执行与 wire contract 等价的长度、枚举、日期和 canonical-object 校验。

### 中：既有 API-key message cost 回归用例被替换

原 `chatAddsCostUsdMicrosForPricedProviderUsage` 被改成 pending continuation 用例。虽然 Backend 45/45 通过，Task 4 合同仍要求非 Codex/API-key 路径不变。应恢复原 message outcome cost 测试，并把 pending preservation 保留为第二个独立测试。

## 已通过证据

- `pnpm --filter @openharness/shared-schema test`：55/55 PASS。
- `pnpm typecheck`：shared-schema、agent-runtime、frontend 全部 PASS。
- `mvn -o -f backend/pom.xml test`：45/45 PASS。
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：PASS；仅 PostHog telemetry DNS warning。
- `git diff --check`：PASS。
- 四项原 finding：pending cost copy、canonical key/Unicode 基础负例、strict response、UTC expiry 均已有实现与测试。

## 最终建议

仅做 Task 4.1 attempt-03 修正：加入安全深度处理、Java 等价边界校验、恢复 API-key cost 测试。完成 RED/GREEN 后回传完整 Report，High 主线程重新运行 spec/quality review。不要推进 client、registry、controller 或 Task 4.2。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 保持 active；无需新增 proposal。
- Task 4.1 当前 Review FAIL；Task 4.2 禁止开始，OpenSpec 3.4 保持未完成。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次未修改项目规则。
