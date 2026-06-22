# add-p5d-eval-cli Closeout

- 文档类型：Closeout
- 日志及版本：2026-06-18 补录，用于 project-dashboard archived 记录闭环

## 核心逻辑

`add-p5d-eval-cli` 为 TS Runtime 添加本地 eval replay CLI。该 CLI 读取 JSON array 或 JSONL 格式的 EvalCase fixtures，顺序调用 EvalReplayHarness，并输出 per-case JSONL 结果与 summary。

## 主要结论

- Eval CLI 归属 `agent-runtime`，不引入 frontend eval UI、远程 eval service 或生产调度能力。
- 输入兼容 JSON array 与 JSONL。
- 输出采用 JSONL 逐条记录 case 结果，并以 summary 汇总。
- CLI 退出码与 pass/fail 状态绑定，全部通过才返回 0。

## 已登记制品

- OpenSpec archive：`openspec/changes/archive/2026-06-05-add-p5d-eval-cli/`
- Plan：`docs/superpowers/plans/2026-06-05-add-p5d-eval-cli.md`
- Source：`agent-runtime/src/evalCli.ts`、`agent-runtime/package.json`
- Tests：`agent-runtime/test/evalCli.test.ts`

## 待办 / 非目标

- 后续可继续推进 eval fixtures、CI pipeline wiring 与 real-provider evals。
- 本 change 不覆盖 frontend eval UI、remote eval service、production scheduler、benchmark dashboard、automatic fixture discovery、persistent eval history。
