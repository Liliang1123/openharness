# Gate D Worker Startup Readiness Window Implementation Review

## 结论

通过。资格 supervisor 默认 Runtime readiness 等待从 30 秒扩大为 180 秒，能够覆盖实测约 86 秒的 4GiB Worker-owned mature database bootstrap；显式 override、authentication fail-fast、业务 workload、10 分钟采样、admission/replay threshold 与正式 Gate D hard-failure 语义均未改变。

## Review 范围

- [Gate D supervisor/executor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Gate D executor tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/formalSoakExecution.test.ts)
- [Attempt004 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004-result-review.md)
- [Worker Runtime child](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)

## 主要发现

### Critical / High

无。

### Medium

1. RED test 让默认配置在第 122 次 readiness probe 才成功；旧 120-poll 默认稳定失败并重现 Attempt004 根因。
2. GREEN 将默认最大 polls 改为 720，poll interval 保持 250ms，即 180 秒。实测 mature Worker bootstrap 约 86 秒，保留约 2.1 倍启动余量。
3. 这是 workload 开始前的 infrastructure readiness window，不是 admission p95、durable replay p95、sustained breach 或 Runtime API timeout；未修改冻结资格阈值。
4. `maximumPolls` 仍可由调用方显式覆盖；401/403 仍立即失败，child exit 仍通过 Promise race 立即失败。

### Low

1. 未修改 public Runtime API、SQLite schema、Worker queue、lifecycle/outbox 或 dashboard status。
2. 未授权或执行 Git 操作、正式 Gate D 或 production promotion。

## 验证记录

- RED：新测试在旧默认下失败，错误为 `Gate D Runtime readiness probe timed out`。
- `pnpm --filter @openharness/agent-runtime test -- formalSoakExecution productionServerLifecycle runtimeStorageWorkerHeartbeat`：61 个测试通过。
- `pnpm --filter @openharness/agent-runtime test`：85 files、683 tests 通过。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `git diff --check`：通过。

## 最终建议

使用全新 runId、clone、report/journal/Java log 运行 Attempt004b。不得覆盖 Attempt004 失败制品；新 Preflight 必须绑定修复后的 source hash 和独立 runner/plan hashes。

## 后续门禁

- OpenSpec：不新增 proposal；4.1d 仍未完成。
- Dashboard：保持 `proposed`。
- Attempt005：成熟回归 PASS 前仍禁止准备。
