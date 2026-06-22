# Add Skill Invocation Sandbox Closeout

- 文档类型：OpenSpec 归档收尾记录
- 日志及版本：2026-06-22 v1.0 archived，记录 `add-skill-invocation-sandbox` 归档结果

## 结论
通过：`add-skill-invocation-sandbox` 已完成实现、验证并归档，规格增量已合入当前 `agent-loop` 与 `provider-adapter` specs。

## 已完成
- `invoke_skill` 元工具已进入 TS Runtime 模型可见工具目录。
- Skill Markdown frontmatter 解析、pending injection 与 provider message capability fallback 已落地。
- 商业/敏感 Skill 的 best-effort shredding 已补充路径穿越与 symlink 防护。
- `default-agent` 特权工具过滤已完成隔离。

## 归档记录
- 归档命令：`npx openspec archive add-skill-invocation-sandbox --yes`
- 归档路径：`openspec/changes/archive/2026-06-22-add-skill-invocation-sandbox/`
- 更新规格：`openspec/specs/agent-loop/spec.md`、`openspec/specs/provider-adapter/spec.md`

## 验证记录
- `pnpm --filter @openharness/agent-runtime test`：207 passed（交接记录）
- `pnpm --filter @openharness/agent-runtime typecheck`：通过（交接记录）
- `npx openspec validate add-skill-invocation-sandbox --strict --no-interactive`：通过
- `npx openspec archive add-skill-invocation-sandbox --yes`：通过；PostHog flush 因网络受限报错但命令退出码为 0，不影响归档结果

## 后续
- 下一阶段进入 `add-subagent-dispatcher`，先完成 OpenSpec proposal 审批，再生成 Superpowers 实施计划并实现。
