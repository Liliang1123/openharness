# Task 13 — observedRestartScheduleMs Overwrite Harden Review

## 结论

通过：上一轮 [implementation review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-fix-implementation-review.md) 指出的 `observedRestartScheduleMs` 预置短路已消除。runner 从空数组采集本轮 restart hook，结束时始终覆盖写入实际观察值；mismatch 测试改为直接构造 report environment 验证 `RESTART_SCHEDULE_MISMATCH`。focused 回归 4 files / 20 tests passed。本结论仅覆盖 preflight runner 加固验收，不代表 formal 24-hour soak 已运行或 Gate D 已关闭。

## Review 范围

- 待审加固说明（用户会话 + Codex 文档更新）：
  - [2026-07-09-task13-24h-soak-preflight-fix-implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-fix-implementation-review.md)
  - [2026-07-09-task13-24h-soak-preflight-fix-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-fix-review.md)
  - [task13-24h-soak-preflight.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task13-24h-soak-preflight.md)
  - [2026-07-09-task13-24h-soak-preflight.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task13-24h-soak-preflight.md)
- 实现：
  - [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
  - [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- 测试：
  - [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
  - [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)
  - [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)

## 主要发现

### Pass — observed 始终由 runner 本轮采集覆盖

位置：

- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts) — `runDeterministicLocalShortBaseline` / `withObservedRestartEnvironment`

确认：

1. `const observedRestartScheduleMs: number[] = []`，不再 `numberArray(input.environment.observedRestartScheduleMs)`。
2. 仅在 restart hook 触发后 `push(restartAtMs)`。
3. `withObservedRestartEnvironment` 变为无条件：

```ts
return {
  ...environment,
  observedRestartScheduleMs
};
```

预置值无法再短路覆盖真实观察结果。

### Pass — mismatch 测试改为直接验证 report oracle

位置：

- [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)

确认：

1. 新增 `overwrites any preseeded observed restart schedule with runner observations`：预置 `[999_000]` 后最终 report 为 `[30_000, 90_000]`。
2. `fails the report when observed restarts do not match the planned schedule` 改为同步调用 `createRuntimeBaselineReport`，直接注入 `observedRestartScheduleMs: [30_000]`（planned 为 `[30_000, 90_000]`），断言 `RESTART_SCHEDULE_MISMATCH` + `result: fail`。
3. 不再依赖运行中污染 `config.environment` 的脆弱路径。

### Pass — 正式 schedule fail-closed 与测试压缩隔离仍保持

二次加固未回退 formal exact-match、`allowCompressedScheduleForTest` 隔离或 `RESOURCE_GROWTH_BREACH` 行为。边界文档仍声明未关 Gate D/B、未勾选 Task 4.2、未标 dashboard verified。

### Residual — Gate D 仍待人工启动（非本轮缺陷）

无 24h 采样 JSON、无 formal report 人工审计、Java Gateway 长驻与磁盘/中断流程仍需启动前确认。这是预期状态，不构成 preflight 加固阻塞。

### Nit — execution 层 planned/observed 断言仍可选

[localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts) 仍主要断言 `restartEvents` / `baselineKind`，未强制 report 内 planned/observed equality。runner 层已有覆盖，不阻塞 Gate D runner 验收。

## 验证记录

本轮独立复跑：

```bash
PATH=/opt/homebrew/bin:$PATH pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution
```

结果：

- 4 files passed
- 20 tests passed

Codex 声明（本轮未全量重跑 full suite / typecheck / openspec，抽查 focused 与代码一致后采信）：

- typecheck：passed
- full agent-runtime：63 files / 314 tests passed
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid；PostHog DNS warning 非阻塞
- `git diff --check`：passed

## 最终建议

1. **接受本轮 observed overwrite 加固**；Task 13 preflight runner 可作为 Gate D 启动前版本。
2. **不要勾选 Task 4.2，不要关闭 Gate D/B，不要把 dashboard 标 verified**。
3. 下一步只剩 Gate D 启动前人工确认：Java Gateway、fixtures、磁盘余量、输出路径、监控、中断/partial report、no-overwrite，并明确批准 24-hour run。
4. 提交时将 Task 13 baseline/docs 与无关的 [AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md) 变更分开处理。

## 后续门禁

- OpenSpec：继续 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- Gate D：人工批准后才能启动 formal 24-hour soak；完成后人工审查 report 才能 promotion。
- Gate B：保持 `pending_production_evidence`。
- Dashboard：本轮不更新为 `verified`。
