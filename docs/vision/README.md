# OpenHarness Vision Docs

> 这一目录收录的是战略性论述和缺口分析，**不是契约 (architecture/)，也不是单个迭代计划 (superpowers/plans/)**。
> 这里的文档解释 OpenHarness 在 LLM Agent 行业中的位置、要做成什么、当前距离目标多远。

## 文档索引

| 文档 | 类型 | 用途 |
|---|---|---|
| [`why-agent-projects-fail-to-land.md`](./why-agent-projects-fail-to-land.md) | 外部论述（转录） | 论述 LLM / Agent Harness / Agent 三层关系，以及为什么 harness 必然平台化 |
| [`openharness-gap-analysis-and-roadmap.md`](./openharness-gap-analysis-and-roadmap.md) | 内部分析 | 把上面那篇文章的 10 项 harness 必备能力对照 OpenHarness 现状，给出差距矩阵和落地路线 |
| [`refactor-playbook.md`](./refactor-playbook.md) | 执行剧本 | 三阶段重构指令（A 兜底 / B 多步 loop / C 叠加），可直接粘贴给开发 Agent |
| [`agent-runtime-stability-implementation-reference-2026-05-25.md`](./agent-runtime-stability-implementation-reference-2026-05-25.md) | 后续实施参考 | 从 V1/V2 Chat 与 SSE 梳理中提炼 Agent Runtime 稳定性、断线恢复、运行态和审批恢复优化点 |
| [`v1-v2-chat-sse-summary-2026-05-25.html`](./v1-v2-chat-sse-summary-2026-05-25.html) | 现状梳理 | V1/V2 Chat、SSE、断线恢复与客户端适配差异说明 |

## 阅读顺序

1. 先读 `why-agent-projects-fail-to-land.md`，理解我们为什么存在。
2. 再读 `openharness-gap-analysis-and-roadmap.md`，理解我们当前在哪、下一步去哪。
3. 需要设计 Agent Runtime 稳定性、SSE 恢复和审批恢复时，读 `v1-v2-chat-sse-summary-2026-05-25.html` 和 `agent-runtime-stability-implementation-reference-2026-05-25.md`。
4. 实施时把 `refactor-playbook.md` 中"## 给 Agent 的指令"那一段发给开发 Agent。
5. Phase B 已落 OpenSpec change：`openspec/changes/add-p3a-multi-step-loop/`（已 strict validate 通过）。

## 与其它 docs 子目录的区别

| 目录 | 内容性质 | 例子 |
|---|---|---|
| `docs/architecture/` | 跨 Runtime 契约和不变式 | `responsibility_boundary.md`、`policy_contract.md` |
| `docs/superpowers/plans/` | 单次迭代的实施计划，按日期归档 | `2026-05-25-add-p2a-mcp.md` |
| `docs/vision/` | 战略论述、行业坐标、长期路线 | 本目录 |
