# Antigravity Step 08 Report

## 修改的文件

在本阶段文档事实与归档指引修正中，对以下物理文件进行了修改（未执行 `git commit`）：

1. [07-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/07-report.md) — 修正了归档与提交命令指引，移除 `git add .`。
2. [2026-06-22-add-subagent-dispatcher-implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md) — 修正了内置特权元工具过滤的实际范围、历史记录隔离事实、错误类型名称，并追加了超时 Promise 的非阻塞风险。
3. [2026-06-22-add-subagent-dispatcher-closeout.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-add-subagent-dispatcher-closeout.md) — 同步修正了特权防御范围、历史记录隔离事实、错误类型名称，并追加了超时底层 Promise 不被主动取消的已知风险说明。

## 修正摘要

1. **归档与提交指引优化**
   - 删除了所有包含 `git add .` 的暂存建议，以及“先 add 后 archive”的流程。
   - 修正为安全流程：用户手动执行 `npx openspec archive` -> 复跑 validate 校验 -> 按需手动更新 dashboard -> 精确执行 `git add <paths>` 暂存修改文件 -> commit。
2. **过滤与特权事实修正**
   - 明确当前内置只对 `invoke_skill` 这一特权元工具做代码级过滤。其他工具（如 `mcp/*`、`invoke_subagent`、`define_subagent` 等）主要通过父级 catalog 和 skill 配置文件中的 `forbidden_tools` 进行限制。
3. **隔离与上下文事实修正**
   - 修正关于 HistoryStore 独立实例的表述，明确 child 实际是利用派生的 `childConversationId` 单独调用 Java chat 服务，父 History 只记录 child 最终产生的 `summary` tool result，不写入 child 中间消息。
4. **错误类型对齐**
   - 修正参数拦截错误为 `SUBAGENT_TOOL_ERROR`（非 `POLICY_DENY`）。
   - 修正超时赛跑错误为 `SUBAGENT_TIMEOUT`（非 `EXECUTION_TIMEOUT`）。
5. **风险收敛**
   - 补齐了在超时 race 触发 `SUBAGENT_TIMEOUT` 时，底层已调起的 Promise 实际上不会被主动取消的已知非阻塞风险。
6. **度量归因事实修正**
   - 修正关于 token 数量聚合的描述，明确当前实现只累加子执行产生的 `usage.costUsdMicros` 并记为 `subagentCostUsdMicros`。

## 验证命令与结果

1. **文档防污染检查**：
   - 使用正则工具在文档中全局检索特权与错误类型废弃的关键词：
     ```bash
     git add \.|mcp/|invoke_subagent|define_subagent|HistoryStore|POLICY_DENY|EXECUTION_TIMEOUT
     ```
   - 结果：检索结果包含若干命中（主要在说明禁止事项、历史归档命令或澄清特权工具机制的叙述中，如“请勿使用精确暂存命令”、“过滤 `mcp/*` 澄清”等）。经逐一核对，这些命中均属合理的事实说明或规范描述，不包含错误代码事实。
2. **开发导航台校验**：
   - 运行：`pnpm dashboard:check`
   - 结果：通过。日志与导航台生成物一致性校验无误。

## 是否仍需用户批准归档

是。项目在物理文件上已具备归档条件。根据物理操作规范限制，本轮**未执行**任何代码/文档提交暂存以及 `npx openspec archive` 指令。

请用户在此步骤复审修改后的文档无误后，依次在本地执行以下安全归档流程：
1. 运行 `npx openspec archive add-subagent-dispatcher --yes`。
2. 运行 `npx openspec validate --strict --no-interactive`。
3. 确认后，通过 `git status` 确认文件列表，然后对文件精确进行 `git add <paths>`（**切勿**使用 `git add .`）。
4. 运行 `git commit -m "feat(subagent): archive add-subagent-dispatcher"`。
