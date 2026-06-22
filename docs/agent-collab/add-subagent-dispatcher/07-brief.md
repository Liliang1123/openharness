# Antigravity Brief: add-subagent-dispatcher Step 07

> [!IMPORTANT]
> 禁止执行 `git add`、`git commit`、`git reset`、`git clean`。
> 禁止执行 `npx openspec archive add-subagent-dispatcher --yes`。
> 本轮只做最终验证、任务状态同步与收尾文档准备；不得扩大实现 scope。

## 背景

Codex 已复审通过 Step 06：child allowed-tool policy audit/execution 的 deny-by-default 与 arguments object-only 防护均已修复，目标测试、组合回归与 typecheck 均通过。

## 本轮目标

完成 `add-subagent-dispatcher` 的最终验证与收尾准备，使该阶段可以进入用户确认后的归档前状态。

## 允许修改范围

- `openspec/changes/add-subagent-dispatcher/tasks.md`
- `docs/project-dashboard/development-log.json`
- `docs/project-dashboard/development-log.md`（仅由 render 脚本生成）
- `docs/project-dashboard/index.html`（仅由 render 脚本生成）
- `docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md`
- `docs/design/2026-06-22-add-subagent-dispatcher-closeout.md`
- `docs/agent-collab/add-subagent-dispatcher/07-report.md`

## 必须执行的验证命令

1. `pnpm --filter @openharness/agent-runtime test`
2. `pnpm --filter @openharness/agent-runtime typecheck`
3. `npx openspec validate add-subagent-dispatcher --strict --no-interactive`
4. 如更新 dashboard：
   - `node docs/project-dashboard/scripts/render-dashboard.mjs`
   - `pnpm dashboard:check`

## 实施要求

1. 先运行全量验证命令 1-3。
2. 只有全量验证通过后，才允许将 `openspec/changes/add-subagent-dispatcher/tasks.md` 对应任务勾选为完成。
3. 只有任务状态真实完成后，才允许更新 dashboard 为 `verified`，并运行 render + dashboard check。
4. 生成 implementation review，至少包含：
   - 结论：`通过` / `有风险` / `需修改`
   - Review 范围，所有路径必须使用 `file:///` 绝对路径 Markdown 链接
   - 实现摘要
   - 验证证据
   - 剩余风险
   - 归档前门禁
5. 生成 closeout 文档，头部必须包含：
   - 文档类型
   - 日志及版本
   - 状态：归档前 closeout / pending user approval
6. 最后生成 `07-report.md`，汇报：
   - 修改文件
   - 验证命令与结果
   - 是否有失败/中断
   - 是否仍需用户批准归档

## 验收条件

- 全量验证命令通过。
- `tasks.md` 勾选与实际完成情况一致。
- dashboard 如被更新，`pnpm dashboard:check` 必须通过。
- implementation review 与 closeout 文档均已落盘。
- `07-report.md` 已生成。

## 失败 / 中断协议

如果任一验证失败或环境受限，请停止修改后续收尾状态，生成 `07-report-abort.md`，写明：

- 失败命令
- 原始错误摘要
- 已修改文件
- 建议 Codex 排障入口
