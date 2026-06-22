# Antigravity Brief: add-subagent-dispatcher Step 08

> [!IMPORTANT]
> 禁止执行 `git add`、`git commit`、`git reset`、`git clean`。
> 禁止执行 `npx openspec archive add-subagent-dispatcher --yes`。
> 本轮只修正文档事实与归档指引；不得修改 runtime 源码、测试、OpenSpec spec delta 或 dashboard 状态。

## 背景

Codex 已复核 Step 07：代码验证全部通过，但收尾文档存在实现事实偏差，且归档/提交指引中 `git add .` 与“先 add 后 archive”的流程不安全。

## 允许修改范围

- `docs/agent-collab/add-subagent-dispatcher/07-report.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md`
- `docs/design/2026-06-22-add-subagent-dispatcher-closeout.md`
- `docs/agent-collab/add-subagent-dispatcher/08-report.md`

## 必须修正的问题

1. 归档指引：
   - 删除所有 `git add .` 建议。
   - 不要建议“先 add 后 archive”。
   - 改为：用户批准后先执行 `npx openspec archive add-subagent-dispatcher --yes`，再复跑 `npx openspec validate --strict --no-interactive`、必要时更新 dashboard archived 状态并 `pnpm dashboard:check`，最后人工 `git status`，按文件范围精确 `git add <paths>`，再 commit。

2. 实现事实修正：
   - privileged meta tools 当前实现只内置过滤 `invoke_skill`；其他工具只有在 parent catalog 不存在或 skill `forbidden_tools` 显式声明时才不会进入 child catalog。不得写成已实现过滤 `mcp/*`、`invoke_subagent`、`define_subagent`。
   - child history 隔离的当前事实是“父 history 不写入 child 中间消息，child 使用派生 `childConversationId` 调用 Java chat”；不得写成新增/拥有独立 `HistoryStore` 实例。
   - 非对象 arguments 的实际错误类是 `SUBAGENT_TOOL_ERROR`，不是 `POLICY_DENY`。
   - dispatcher 超时的实际错误类是 `SUBAGENT_TIMEOUT`，不是 `EXECUTION_TIMEOUT`。

3. 保留但收敛风险描述：
   - Java Gateway 联调未覆盖：保留为非阻塞风险。
   - `withTimeout` 不取消底层 Promise：保留为非阻塞风险。

## 验证要求

- 本轮是文档修正，可不跑全量单测。
- 必须运行：`pnpm dashboard:check`，确认文档修正未破坏 dashboard 生成一致性。
- 必须运行：`rg -n "git add \\.|mcp/|invoke_subagent|define_subagent|HistoryStore|POLICY_DENY|EXECUTION_TIMEOUT" docs/agent-collab/add-subagent-dispatcher/07-report.md docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md docs/design/2026-06-22-add-subagent-dispatcher-closeout.md`
  - 如果有命中，必须逐项确认是否为“说明不要这么做/历史风险”而不是错误事实；否则继续修正。

## 产出

生成 `docs/agent-collab/add-subagent-dispatcher/08-report.md`，包含：

- 修改文件
- 修正摘要
- 验证命令与结果
- 是否仍需用户批准归档

## 验收条件

- 文档事实与当前代码一致。
- 不再出现 `git add .` 作为建议命令。
- 不再把未实现能力写成已完成。
- Codex 复审通过后，才进入归档批准阶段。
