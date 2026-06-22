# Antigravity Brief: add-subagent-dispatcher Step 09

> [!IMPORTANT]
> 禁止执行 `git add`、`git commit`、`git reset`、`git clean`。
> 禁止执行 `npx openspec archive add-subagent-dispatcher --yes`。
> 本轮只修正文档表述；不得修改 runtime 源码、测试、OpenSpec spec delta 或 dashboard 状态。

## 背景

Codex 复审 Step 08 后确认大部分问题已修复，但仍有两处文档准确性问题：

1. 文档仍称当前实现聚合 tokens；实际 runtime 只聚合 `usage.costUsdMicros`。
2. `08-report.md` 声称关键词检查零命中；实际有命中，其中多为禁止事项说明或事实澄清语境，因此报告必须改为“有命中但已逐项确认”。

## 允许修改范围

- `docs/agent-collab/add-subagent-dispatcher/08-report.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md`
- `docs/design/2026-06-22-add-subagent-dispatcher-closeout.md`
- `docs/agent-collab/add-subagent-dispatcher/09-report.md`

## 必须修正的问题

1. 删除或改写所有“当前实现已聚合 tokens / 输入输出 tokens 数量”的描述。
   - 改为：当前实现聚合 Java `ModelChatResponse.usage.costUsdMicros`，并在父 trace metadata 中记录 `subagentCostUsdMicros`。
   - 可以说明 token 字段若未来需要更细粒度归因，应另开 change 或扩展 runtime usage 类型。

2. 修正 `08-report.md` 的关键词检查结论。
   - 不得写“零命中”。
   - 应写：复核命令仍会命中若干禁止事项说明或事实澄清语境，例如“请勿使用精确暂存禁忌命令”、`mcp/*` 等，但这些命中不是错误事实；已逐项确认。

## 验证要求

运行：

```bash
rg -n "tokens|输入/输出 tokens|零命中|git add \\.|mcp/|invoke_subagent|define_subagent|HistoryStore|POLICY_DENY|EXECUTION_TIMEOUT" docs/agent-collab/add-subagent-dispatcher/08-report.md docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md docs/design/2026-06-22-add-subagent-dispatcher-closeout.md
pnpm dashboard:check
```

要求：
- `tokens` / `输入/输出 tokens` 不得作为已实现能力描述出现。
- `零命中` 不得出现。
- 其他关键词若仍出现，必须是禁止事项说明或事实澄清语境，并在 `09-report.md` 中说明。
- `pnpm dashboard:check` 必须通过。

## 产出

生成 `docs/agent-collab/add-subagent-dispatcher/09-report.md`，包含：

- 修改文件
- 修正摘要
- 验证命令与结果
- 是否仍需用户批准归档

## 验收条件

- 文档事实与当前代码一致。
- 不再宣称当前实现聚合 token counts。
- 不再错误声称关键词检查零命中。
- Codex 复审通过后，才进入用户批准归档阶段。
