# Codex + Antigravity CLI 用户操作手册 Review

## 结论

通过：该用户操作手册可以作为当前项目多 Agent 协作的实际使用指南。它吸收了其他 Agent 的关键 review 建议，包括 `docs/agent-collab/` 协作总线、Brief 头部禁止事项置顶、单 Step 文件复用、abort report 中断协议，以及“先试运行再固化 AGENTS.md”的渐进策略。

## Review 范围

- [用户操作手册](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-codex-antigravity-operator-guide.md)
- [协作规范文档](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-codex-antigravity-collaboration-protocol.md)
- [协作规范 Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-codex-antigravity-collaboration-protocol-review.md)
- [项目根规则](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- [OpenSpec 项目规则](file:///Users/elvis/file/develop/opensource/openharness/openspec/AGENTS.md)

## 主要发现

### P0 / 阻塞问题

未发现阻塞问题。

### P1 / 关键结论

1. **`docs/agent-collab/` 作为协作总线是合适的**
   - 该目录让 Codex 与 Antigravity CLI 通过物理文件交换任务边界、报告、review 和中断信息，减少复制粘贴造成的上下文丢失。
   - 阶段收尾再决定保留、压缩归档或清理，避免过早污染长期文档。

2. **Brief 头部置顶禁止事项是必要约束**
   - 使用 `> [!IMPORTANT]` 明确禁止扩大 scope、`git add` / `git commit`、`npx openspec archive`、无关格式化等行为。
   - 该设计能降低长上下文下 Implementer Agent 注意力稀释风险。

3. **单 Step 文件复用优于 r2/r3 文件膨胀**
   - 手册已采用在原 `01-brief.md` 底部追加 Fix Brief、在 `01-review.md` 追加多轮 review 记录的策略。
   - 该策略更利于 Agent 理解“当前最新状态”。

4. **Abort Report 协议补齐了阻塞流转**
   - 当 Antigravity CLI 遇到越界、测试失败原因不清、需新增依赖、需改 OpenSpec 或环境阻塞时，必须停止并写 `report-abort.md`。
   - 这能让 Codex 后续 review / 排障有稳定输入。

5. **暂不修改 `AGENTS.md` 是合理的**
   - 先用 `add-subagent-dispatcher` 跑完一轮，再判断是否固化项目规则，能避免把未验证流程过早写入长期约束。

### P2 / 后续优化

1. 跑完第一轮后，应 review Antigravity CLI 是否真的遵守 Brief / report / abort 约束。
2. 如果流程稳定，建议新增一个小节到 `AGENTS.md`，标题可为 `Multi-Agent Collaboration Rules`。
3. `docs/agent-collab/` 是否纳入 git 或阶段后清理，应在 closeout 时由用户决策。

## 最终建议

- 立即按该手册启动 `add-subagent-dispatcher` 的第一轮协作。
- 第一轮结束后，Codex 应专项 review：是否需要把核心规则固化到 `AGENTS.md`。
- 在固化前，每个 Brief 必须物理置顶禁止事项，不能只依赖口头提示。

## 后续门禁

- `add-subagent-dispatcher` 仍需用户批准 OpenSpec proposal 后，才能生成 Superpowers implementation plan 并分派 Antigravity CLI。
- 第一轮 Antigravity CLI 实施完成后，Codex 必须 review `docs/agent-collab/<change-id>/01-report.md`、可能存在的 `01-report-abort.md` 和当前 `git diff`。
- 是否固化到 `AGENTS.md`，必须等 `add-subagent-dispatcher` 至少跑完一轮后再判断。
