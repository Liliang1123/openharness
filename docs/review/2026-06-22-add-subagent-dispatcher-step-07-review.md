# Codex Review: add-subagent-dispatcher Step 07

## 结论

需修改：Step 07 的代码与验证门禁通过，但收尾文档和归档指引存在阻塞级不准确描述。当前不能直接按 Antigravity 建议执行 `git add .` / archive / commit；需要先修正文档中的实现事实偏差与归档顺序，再进入用户批准归档。

## Review 范围

- [Step 07 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/07-brief.md)
- [Step 07 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/07-report.md)
- [Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md)
- [Closeout](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-add-subagent-dispatcher-closeout.md)
- [OpenSpec Tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-subagent-dispatcher/tasks.md)
- [Dashboard Source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)
- [SubagentDispatcher](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [AgentExecutionRunner](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)

## 已通过项

- `pnpm --filter @openharness/agent-runtime test`：通过，40 files / 219 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `npx openspec validate add-subagent-dispatcher --strict --no-interactive`：退出码 0，`Change 'add-subagent-dispatcher' is valid`；PostHog flush 网络报错为非阻塞遥测问题。
- `pnpm dashboard:check`：通过，dashboard generated outputs current。
- `openspec/changes/add-subagent-dispatcher/tasks.md` 已按实际验证勾选完成。
- `docs/project-dashboard/development-log.json` 中 `add-subagent-dispatcher` 已为 `verified`。

## 阻塞问题

### P0: 归档/提交指引顺序错误且 `git add .` 范围过宽

- 位置：
  - [07-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/07-report.md)
  - [implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md)
- 问题：文档建议先 `git add .`，再 `npx openspec archive ...`，最后 commit。这样会先暂存归档前 change 文件，随后 archive 又移动/修改 OpenSpec 文件，容易造成 staged/unstaged 混杂。
- 风险：`git add .` 还会把当前工作区历史遗留、未审阅或无关文件全部纳入提交，违反本项目“最小必要改动”和“不得误提交无关变更”规则。
- 必须修复：改为“用户批准后先执行 archive，再复跑 validate/dashboard check，再人工 review `git status`，最后按文件范围精确 `git add <paths>`”。不要建议 `git add .`。

### P1: 收尾文档夸大/写错当前实现事实

- 位置：
  - [implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md)
  - [closeout.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-add-subagent-dispatcher-closeout.md)
- 问题与证据：
  - 文档称过滤 `mcp/*`、`invoke_subagent`、`define_subagent` 等，但当前 `agent-runtime/src/subagent/dispatcher.ts:6` 的 privileged meta tools 只有 `invoke_skill`；`forbidden_tools` 是 skill 显式声明才会过滤。
  - 文档称子智能体拥有独立 `HistoryStore`，但当前实现事实是用派生的 `childConversationId` 调用 Java chat，且父 `HistoryStore` 不写入 child 中间消息；没有新增独立 `HistoryStore` 实例或持久化子 history store。
  - 文档称非法参数触发 `POLICY_DENY`，但实际 `agent-runtime/src/subagent/dispatcher.ts:167-175` 返回 `SUBAGENT_TOOL_ERROR`。
  - 文档称超时触发 `EXECUTION_TIMEOUT`，但 dispatcher 实际返回 `SUBAGENT_TIMEOUT`，父层再以 `invoke_skill` tool error 表达。
- 风险：closeout/review 会成为后续归档与交接依据，若事实不准，会误导后续 Agent 或用户认为已有更强的 sandbox/history 能力。
- 必须修复：文档必须严格改成当前代码事实，不得把未来设计或非本轮实现写成已完成。

## 非阻塞风险

- 真实 Java Gateway 联调仍未执行；当前验证基于 TS runtime 单测与 fake JavaClient，作为归档前风险说明即可，不阻塞本地 OpenSpec 归档。
- `withTimeout` 不取消底层 Promise，只做 race 级超时；此前 Step 05 已接受为当前边界，需保留为非阻塞风险。

## Fix Brief

已创建 [08-brief.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/08-brief.md)，要求 Antigravity 只修正文档事实与归档指引，不改 runtime 代码，不重新扩大实现范围。

## 后续门禁

- 先完成 Step 08 文档修正并提交 `08-report.md`。
- Codex 复审 Step 08 通过后，才可以向用户请求归档批准。
- 即使用户批准归档，也应先 archive，再复跑校验，再精确 staging；不要使用 `git add .`。

## Next-step Permission

no。Step 07 收尾文档需修正后才能进入归档批准阶段。
