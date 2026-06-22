# Codex + Antigravity CLI 用户操作手册

- 文档类型：用户操作手册
- 日志及版本：2026-06-22 v1.0 accepted，吸收其他 Agent review 建议后落地；约定先在 `add-subagent-dispatcher` 跑完一轮后再评估是否固化到 `AGENTS.md`

## 1. 结论

通过：后续用户建议采用 **两个 CLI 窗口 + 仓库内 Markdown 文件作为协作总线** 的方式协作，而不是在两个窗口之间反复复制大段上下文。

- Codex 窗口：方案细化、OpenSpec / Superpowers plan、Antigravity Brief、Review Gate、收尾判断。
- Antigravity CLI 窗口：按 Brief 实施、跑验证、写 report；遇到越界或阻塞必须停止并写 abort report。
- 用户：只负责在两个窗口间传递短指令，批准 proposal / 风险 / 归档 / 提交等关键决策。

## 2. 协作总线目录

推荐使用：

```text
docs/agent-collab/
  <change-id>/
    01-brief.md
    01-report.md
    01-review.md
    01-report-abort.md   # 仅中断时生成
    02-brief.md
    02-report.md
    02-review.md
```

示例：

```text
docs/agent-collab/add-subagent-dispatcher/
```

说明：

- `docs/agent-collab/` 是临时但可追溯的协作总线。
- 阶段收尾时由用户决定保留、压缩归档或清理中间 brief/report。
- 重要 review 仍必须同步落盘到 `docs/review/`。

## 3. 每轮标准流程

### 3.1 Codex 生成 Brief

用户在 Codex 窗口输入：

```text
请基于当前 approved OpenSpec change 和 implementation plan，生成本轮 Antigravity CLI 执行 Brief，落盘到 docs/agent-collab/<change-id>/01-brief.md。
```

Codex 必须在 Brief 中写清：

- 本轮目标；
- 必读文件；
- 允许修改文件；
- 禁止事项；
- 必须验证命令；
- report 输出路径；
- abort report 输出路径。

### 3.2 Antigravity CLI 实施

用户在 Antigravity CLI 窗口输入：

```text
请读取 docs/agent-collab/<change-id>/01-brief.md，并严格按其中要求实施。
完成后不要提交代码，不要归档 OpenSpec。
请把工作报告写入 docs/agent-collab/<change-id>/01-report.md。
如果遇到 Brief 未覆盖、测试失败原因不清、需要扩大 scope 或环境阻塞，请立即停止，并写入 docs/agent-collab/<change-id>/01-report-abort.md。
```

### 3.3 Codex Review

Antigravity CLI 完成后，用户回到 Codex 窗口输入：

```text
请 review docs/agent-collab/<change-id>/01-report.md 和当前 git diff。
如果存在 docs/agent-collab/<change-id>/01-report-abort.md，也请一并 review。
请把本轮 review 写入 docs/agent-collab/<change-id>/01-review.md；重要 review 同步落盘到 docs/review/YYYY-MM-DD-<change-id>-step-01-review.md。
如果需要修改，请把 Fix Brief 追加到 docs/agent-collab/<change-id>/01-brief.md 底部。
```

Codex 结论必须使用：

- `通过`：进入下一 Step 或阶段收尾；
- `有风险`：由用户决定接受风险或继续修；
- `需修改`：Antigravity CLI 必须按 Fix Brief 修复。

### 3.4 返工修复

如果 Codex review 为 `需修改`，用户在 Antigravity CLI 输入：

```text
请读取 docs/agent-collab/<change-id>/01-brief.md 底部最新 Fix Brief，只修复其中列出的问题。
不要扩大 scope，不要提交代码，不要归档 OpenSpec。
完成后更新 docs/agent-collab/<change-id>/01-report.md。
如无法继续，请写 docs/agent-collab/<change-id>/01-report-abort.md。
```

修复后回到 Codex Review，直到 `通过` 或用户决定停止。

## 4. Brief 文件头部固定禁止事项

每个 Antigravity Brief 文件头部必须置顶以下内容：

```markdown
> [!IMPORTANT]
> 本文件是 Antigravity CLI 的唯一执行边界。
> 禁止扩大 scope。
> 禁止 `git add` / `git commit`。
> 禁止 `npx openspec archive`。
> 禁止批量格式化、import 排序或重排无关代码。
> 遇到 Brief 未覆盖的问题、测试失败原因不清、需要新增依赖、需要改 OpenSpec 或架构边界时，必须停止并写 abort report。
```

## 5. Report 模板

Antigravity CLI 正常完成后写入：`docs/agent-collab/<change-id>/<step>-report.md`。

```markdown
# Agent Work Report: Step <NN>

## 改动文件
- ...

## 实现摘要
- ...

## 验证命令
- `command`：passed / failed / skipped

## 已知风险
- ...

## 未完成
- ...

## 需要 Review Owner 判断的问题
- ...
```

## 6. Abort Report 模板

Antigravity CLI 遇到阻塞时写入：`docs/agent-collab/<change-id>/<step>-report-abort.md`。

```markdown
# Abort Report: Step <NN>

## 中断结论
需修改：当前任务无法在 Brief 边界内安全继续。

## 中断原因
- ...

## 已执行操作
- ...

## 错误日志
```text
...
```

## 当前工作区状态
- ...

## 需要 Codex 判断的问题
- ...
```

## 7. 每天如何开两个 CLI 窗口

### 7.1 Codex 窗口启动提示

```text
项目路径：/Users/elvis/file/develop/opensource/openharness

请先阅读：
- AGENTS.md
- openspec/AGENTS.md
- docs/design/2026-06-22-codex-antigravity-collaboration-protocol.md
- docs/design/2026-06-22-codex-antigravity-operator-guide.md
- 当前 change 的 proposal/design/tasks
- docs/agent-collab/<change-id>/ 最新 brief/report/review

你是 Review Owner。请负责方案细化、Brief 生成、Review Gate 和收尾判断。
```

### 7.2 Antigravity CLI 窗口启动提示

```text
项目路径：/Users/elvis/file/develop/opensource/openharness

你是 Implementer Agent。
请只按 docs/agent-collab/<change-id>/<step>-brief.md 执行。
禁止扩大 scope，禁止 git add / git commit，禁止 openspec archive。
完成后写 report，不要自行进入下一步。
遇到阻塞或越界时写 report-abort 并停止。
```

## 8. 用户防跑偏检查清单

每轮用户只需要检查：

- Antigravity CLI 是否只读取了指定 `brief.md`？
- Antigravity CLI 是否只改了 Brief 允许的文件？
- Antigravity CLI 是否写了 `report.md` 或 `report-abort.md`？
- Codex 是否 review 了当前 `git diff`，而不是只看报告？
- Codex 结论是否是 `通过 / 有风险 / 需修改`？
- `需修改` 时，Codex 是否把 Fix Brief 追加到了当前 `brief.md` 底部？
- `通过` 前，是否没有进入下一 Step？

## 9. Antigravity CLI 必须停止的情况

遇到以下任何情况，Antigravity CLI 必须停止并写 `report-abort.md`：

- Brief 未允许的文件也必须修改；
- 测试失败但原因不清；
- 需要新增依赖；
- 需要修改 OpenSpec；
- 需要修改架构边界；
- 发现安全、权限、沙箱风险；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足；
- 任务范围看起来比 Brief 大。

## 10. Codex 必须询问用户的情况

Codex 遇到以下情况必须询问用户：

- 是否批准 OpenSpec proposal；
- 是否接受 `有风险` 结论；
- 是否归档 change；
- 是否提交代码；
- 是否扩大 scope；
- 是否修改项目级规则，例如 `AGENTS.md`。

## 11. 文件更新策略

为防上下文膨胀，本项目默认不为同一步骤创建 `r2` / `r3` 多份 brief 文件。

推荐方式：

- `01-brief.md`：Codex 可在底部追加最新 Fix Brief；
- `01-report.md`：Antigravity CLI 覆盖或追加最新工作报告；
- `01-review.md`：Codex 追加多轮 review 记录；
- `01-report-abort.md`：仅中断时新增或更新。

## 12. 固化规则策略

当前先不修改 `AGENTS.md`。

策略：

1. 先用本操作手册跑完 `add-subagent-dispatcher` 至少一轮 Codex Brief → Antigravity 实施 → Codex Review。
2. 如果流程稳定，再把核心约束固化到项目 `AGENTS.md`。
3. 固化候选内容包括：
   - `docs/agent-collab/` 作为协作总线；
   - Implementer 必须按 Brief 执行；
   - 禁止 `git add` / `git commit` / `npx openspec archive`；
   - 受阻必须写 `report-abort.md`；
   - 重要 review 必须落盘。
