# Codex + Antigravity CLI 协作规范

- 文档类型：项目协作流程规范
- 日志及版本：2026-06-22 v1.0 proposed，首次定义 Codex Review Owner 与 Antigravity CLI Implementer 的分工、交付物、门禁与循环方式

## 1. 结论

通过：后续建议固定采用 **Codex 负责方案细化与 Review Gate，Antigravity CLI 负责按受控 Brief 实施** 的双 Agent 协作模式。

该模式的核心价值是把“设计决策权、契约解释权、验收权”和“代码执行权”分离：

- Codex 作为 **Review Owner / Spec Owner**：负责 OpenSpec、Superpowers plan、执行 Brief、Review 结论、收尾判断。
- Antigravity CLI 作为 **Implementer Agent**：只按本轮 Brief 修改允许范围内的文件，完成后输出实现报告与验证证据。
- 用户作为 **Approval Owner**：批准 OpenSpec proposal、批准进入实现、决定是否归档/提交。

## 2. 适用范围

适用于本项目中所有涉及以下内容的开发活动：

- 新能力、新架构边界、运行时语义变化；
- 安全、权限、沙箱、子智能体、工具执行、成本归因等高风险改动；
- 多文件实现、复杂测试、OpenSpec change；
- 需要反复实现 / review / 修复 / 再 review 的阶段性工作。

不强制适用于：

- 单纯错别字、注释、低风险文档微调；
- 用户明确要求某个 Agent 独立完成的小任务；
- 紧急只读排查且不修改文件的场景。

## 3. 角色分工

| 角色 | 职责 | 禁止事项 |
|------|------|----------|
| Codex / Review Owner | 细化方案、写 OpenSpec、写实施计划、产出 Antigravity Brief、review diff、判断是否可收尾 | 未经用户批准不得绕过 OpenSpec 实现；不得口头 review 后不落盘重要结论 |
| Antigravity CLI / Implementer | 按 Brief 做最小实现、补测试、跑验证、输出工作报告 | 不得扩大 scope；不得擅自 `git add` / `git commit`；不得擅自 archive OpenSpec；不得批量格式化无关文件 |
| User / Approval Owner | 批准 proposal、批准进入实施、决定提交/归档 | 不建议让执行 Agent 在未 review 通过前连续扩大实现 |

## 4. 标准生命周期

```text
OpenSpec proposal/design/tasks
  ↓ 用户批准 proposal
Superpowers implementation plan
  ↓ Codex 生成 Antigravity Implementation Brief
Antigravity CLI 实施单个 Step
  ↓ Antigravity 输出 Agent Work Report
Codex Review Gate
  ├─ 需修改 → Codex 生成 Fix Brief → Antigravity 修复 → 再 Review
  ├─ 有风险 → 用户确认是否接受风险或继续修复
  └─ 通过 → 进入下一 Step 或阶段收尾
全部 Step 通过
  ↓ 正式验证
Closeout + dashboard + handoff
  ↓ 用户确认后 OpenSpec archive
```

## 5. 必备交付物

### 5.1 Codex 产物

| 阶段 | 文件位置 | 说明 |
|------|----------|------|
| OpenSpec proposal | `openspec/changes/<change-id>/proposal.md` | 说明为什么做、做什么、影响范围 |
| OpenSpec design | `openspec/changes/<change-id>/design.md` | 架构决策、边界、风险与迁移 |
| OpenSpec tasks | `openspec/changes/<change-id>/tasks.md` | 可验收任务清单 |
| Spec deltas | `openspec/changes/<change-id>/specs/**/spec.md` | 需求契约增量 |
| 实施计划 | `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md` | 用户批准 proposal 后才能生成 |
| 设计/流程文档 | `docs/design/` | 重要设计和协作规范落地位置 |
| Review 文档 | `docs/review/YYYY-MM-DD-<topic>-review.md` | 重要 review 结论必须落盘 |
| Closeout | `docs/design/YYYY-MM-DD-<change-id>-closeout.md` | 阶段完成与验证记录 |
| Handoff | `docs/handoffs/` | 新窗口或跨 Agent 续跑交接 |

### 5.2 Antigravity CLI 工作报告

Antigravity CLI 每轮完成后，必须返回以下结构：

```markdown
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

## 6. Codex 给 Antigravity CLI 的 Brief 模板

```markdown
你是 Antigravity CLI 执行 Agent。请严格按本 Brief 实施，不要扩大 scope。

项目路径：
/Users/elvis/file/develop/opensource/openharness

当前 change：
<change-id>

必读文件：
- openspec/changes/<change-id>/proposal.md
- openspec/changes/<change-id>/design.md
- openspec/changes/<change-id>/tasks.md
- docs/superpowers/plans/YYYY-MM-DD-<change-id>.md
- AGENTS.md
- openspec/AGENTS.md

本轮只执行：
- Step <N>：<明确任务>

允许修改：
- <file path>

禁止修改：
- 不要修改本轮允许范围外的文件
- 不要 `git add` / `git commit`
- 不要运行 `npx openspec archive`
- 不要批量格式化、import 排序或重排无关代码
- 不要引入新依赖，除非 Brief 明确允许
- 不要绕过 failing tests 或用 fallback 掩盖根因

必须验证：
- `<command>`

完成后返回：
1. 改动文件
2. 实现摘要
3. 验证输出
4. 未完成项
5. 风险
```

## 7. Codex Review Gate 标准

Codex review 必须优先检查：

1. **契约一致性**：实现是否满足 OpenSpec proposal、design、tasks 与 spec deltas。
2. **范围控制**：是否只改了 Brief 允许文件；是否出现无关格式化或顺手重构。
3. **安全边界**：权限、工具过滤、路径、沙箱、敏感信息、日志是否符合约束。
4. **测试证据**：是否先有失败用例或明确测试覆盖；验证命令是否真实运行。
5. **错误处理**：是否用 fallback / catch-all 掩盖根因；失败是否有结构化分类。
6. **观测与收尾**：trace、dashboard、closeout、handoff 是否在对应阶段更新。

Review 结论必须使用以下三类之一开头：

- `通过`：可以进入下一 Step 或阶段收尾。
- `有风险`：可以继续推进，但必须说明风险、未验证项和是否需要用户接受。
- `需修改`：存在阻塞问题，必须给 Antigravity CLI 修复 Brief。

## 8. 单 Step 粒度原则

默认每次只让 Antigravity CLI 执行一个小 Step，特别是以下场景：

- 安全/权限/沙箱相关；
- Agent loop、ToolRegistry、HistoryStore、Policy、MCP 等核心路径；
- 跨 `agent-runtime` 与 `openspec` 的变更；
- 涉及 abort / timeout / cost / trace 的行为变化。

只有在以下条件同时满足时，才允许合并多个 Step：

1. 文件范围高度重叠；
2. 风险低；
3. 验证命令一致；
4. Codex 明确在 Brief 中批准合并。

## 9. 返工循环规则

当 Codex review 输出 `需修改` 时：

1. Codex 必须给出可复制的 Fix Brief；
2. Antigravity CLI 只能修复 review 指定问题；
3. 不得借修复机会新增未批准功能；
4. 修复后必须重新输出 Agent Work Report；
5. Codex 必须再次 review，不能默认认为已修好。

## 10. 阶段收尾标准

一个阶段只有同时满足以下条件，Codex 才能判断可收尾：

- `openspec/changes/<change-id>/tasks.md` 全部真实完成；
- 相关测试、typecheck、OpenSpec validate 已通过；
- 重要 review 结论已落盘到 `docs/review/`；
- dashboard 在 required sync point 已更新并通过 `pnpm dashboard:check`；
- closeout 文档已写入 `docs/design/`；
- 若需要新窗口续跑，`docs/handoffs/latest.md` 已更新；
- 用户确认可以归档后，才执行 `npx openspec archive <change-id> --yes`。

## 11. 当前项目推荐默认策略

对 `add-subagent-dispatcher` 及后续高风险阶段，推荐默认执行：

1. Codex 先完成并等待用户批准 OpenSpec proposal；
2. Codex 生成 `docs/superpowers/plans/YYYY-MM-DD-add-subagent-dispatcher.md`；
3. Codex 每次只给 Antigravity CLI 一个 Step Brief；
4. Antigravity CLI 实施并返回工作报告；
5. Codex review 并落盘；
6. 重复直到全部 Step 通过；
7. Codex 生成 closeout、dashboard sync、handoff；
8. 用户确认后归档。

## 12. 风险与控制

| 风险 | 控制方式 |
|------|----------|
| 执行 Agent 扩大 scope | Brief 明确允许/禁止文件，Codex review 检查 `git diff` |
| Review 结论丢失 | 重要 review 必须落盘 `docs/review/` |
| 多 Agent 状态漂移 | 使用 handoff、dashboard、OpenSpec tasks 作为状态锚点 |
| 实现先于契约 | OpenSpec proposal 未批准前禁止实现代码 |
| 测试通过但契约不满足 | Review 同时检查 spec、design、tasks、代码事实和验证输出 |
| 无关格式化污染 diff | Brief 与项目规则均禁止批量格式化无关文件 |
| 归档过早 | 必须 closeout + dashboard + 用户确认后归档 |
