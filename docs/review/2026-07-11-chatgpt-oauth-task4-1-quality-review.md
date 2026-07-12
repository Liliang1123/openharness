# ChatGPT/Codex OAuth Task 4.1 代码质量 Review

## 结论

需修改。Task 4.1 的初始 shared contract 已通过 spec compliance review，但代码质量 review 发现四项可执行问题；在全部修复并重新通过 spec/quality review 前，不得推进 Task 4.2。

## Review 范围

- [Task 4.1 实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [ModelController](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelController tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## 主要发现

### 高：成本复制路径丢失 continuation

`ModelController.withCost()` 原先使用旧六参数构造器复制响应，会丢失 `pendingTurn` 和 `idempotentReplay`；pending response 带 usage 时会违反 exactly-one-of 构造器约束。中断前已新增 pending+usage RED 测试并修改为完整构造器，但尚未完成整批 GREEN 复验。

### 中：canonical JSON 依赖 JavaScript 属性枚举顺序

当前 `Object.fromEntries` 后 `JSON.stringify` 的实现会重新排序整数形态键，无法稳定验证跨语言 canonical JSON，并接受 lone surrogate。中断前已增加数字键、嵌套、数字、Unicode、特殊键、重复键的 RED 测试；当前 shared-schema fresh 结果为 53 tests 中 1 failure，正停在预期 RED。

### 中：ModelChatResponse 顶层未 strict

未知顶层字段会被静默剥离，可能掩盖意外敏感字段。需要 `.strict()` 与 unknown/sensitive-field 负例。

### 中：expiresAt 无固定边界

当前 datetime 校验接受超长小数秒。需要固定为 UTC `Z` 形式并限制为明确的秒或毫秒精度，拒绝 offset、超长和非法日期。

## 最终建议

在当前 partial diff 上续跑，不要删除重做已通过的 Task 4.1 初始 RED/GREEN。先完成手写、跨语言确定的 canonical JSON validator，再补 strict response 与固定时间格式；运行 shared-schema、全仓 typecheck、ModelController focused tests、Java compile 和 diff check。全部 GREEN 后提交结构化 Report 给 High 主线程重新做 spec review 与 quality review。

## 后续门禁

- OpenSpec change `add-chatgpt-oauth-auth` 继续 active；无需新增 proposal。
- 不推进 Task 4.2，不勾 OpenSpec 3.4。
- 不读取 OAuth credential，不实现 client/registry/controller/tool execution。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次未修改项目规则。
