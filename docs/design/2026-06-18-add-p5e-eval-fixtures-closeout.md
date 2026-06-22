# P5e Eval Fixtures Smoke Closeout

文档类型：实施收尾记录  
日志及版本：v1 / 2026-06-18 / add-p5e-eval-fixtures archived

## 结论

通过：`add-p5e-eval-fixtures` 已完成实现、验证和 OpenSpec 归档。

## 核心逻辑

- 在 `agent-runtime/fixtures/eval/smoke.jsonl` 增加 canonical deterministic `EvalCase`。
- 在 `agent-runtime/src/evalCli.ts` 增加显式 `--mock-answer <text>` 模式，用于本地 deterministic smoke；未传该参数时继续走默认 `HttpJavaClient` / `EvalReplayHarness` 路径。
- 在 `agent-runtime/package.json` 增加 `eval:smoke` 脚本：
  - `pnpm eval:replay -- --file fixtures/eval/smoke.jsonl --mock-answer "hello from eval smoke"`
- 在 `agent-runtime/test/evalCli.test.ts` 增加：
  - fixture 通过 `EvalCaseSchema` 解析的测试；
  - deterministic smoke 退出 `0` 并输出 summary 的测试。

## 验证记录

- RED：`pnpm --filter @openharness/agent-runtime test -- evalCli`
  - 预期失败：fixture 文件缺失、`--mock-answer` 未实现。
- GREEN：
  - `pnpm --filter @openharness/agent-runtime test -- evalCli`：7 tests passed。
  - `pnpm --filter @openharness/agent-runtime typecheck`：passed。
- Targeted regression：
  - `pnpm --filter @openharness/agent-runtime run eval:smoke`：输出 1 条 result + 1 条 summary，退出 `0`。
  - `pnpm --filter @openharness/agent-runtime test -- evalCli evalReplayHarness`：10 tests passed。
  - `pnpm --filter @openharness/agent-runtime typecheck`：passed。
- Full verification：
  - `pnpm typecheck`：passed。
  - `pnpm test`：shared-schema 27、agent-runtime 168、frontend 11、integration-tests 17 全部 passed。
  - `mvn test -f backend/pom.xml`：BUILD SUCCESS，26 tests passed。
  - `npx openspec validate --all --strict --no-interactive`：21 specs passed。
- Archive：
  - `npx openspec archive add-p5e-eval-fixtures --yes`
  - archived path：`openspec/changes/archive/2026-06-18-add-p5e-eval-fixtures/`
  - post-archive `npx openspec list`：No active changes found。

## 风险与注意事项

- `npx openspec` 的 PostHog 网络上报失败为非阻塞遥测噪声，不影响 validate/archive 结果。
- 沙箱内执行需要监听本地地址或创建 `tsx` IPC pipe 的命令可能出现 `listen EPERM`；已在用户授权的沙箱外重跑并通过。
- 当前项目目录不是常规已提交 git worktree，无法使用独立 `git worktree` 流程；本次按用户继续推进指令在现有目录最小改动。

## 待办

- 暂无 active OpenSpec change。
- 后续如要引入 CI pipeline wiring、production benchmark、dashboard 或 real-provider eval，应新建 OpenSpec change。
