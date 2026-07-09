# Task 12D Actual Local Short Baseline Design Closeout

- 文档类型：设计收口 / 本地 30-minute baseline 执行记录
- 日志及版本：2026-07-09 v1.0，记录 Task 12D 实际执行 30-minute local short baseline、seed bug 修复、最终 v2 报告与剩余门禁

## 结论

通过：Task 12D 已实际运行 30-minute deterministic local short baseline，生成 `60` 个 30 秒采样点，在 `elapsedMs=900000` / `sampleIndex=29` 触发一次 TS runtime restart hook，并落盘 no-overwrite v2 JSON 报告。该结论仅适用于 `local_verified` 本地轨道，不等价于 formal 24-hour soak，不关闭 Gate B/Gate D。

## 核心设计

1. Baseline execution 复用 Task 12A/12B/12C 的 seed、sampler、report schema 与 no-overwrite writer。
2. `runLocalThirtyMinuteBaseline` 在本地临时 SQLite 中迁移 runtime schema，种入 deterministic workload，并在 30 分钟内每 30 秒采样一次。
3. Restart hook 在 minute 15 执行 close/reopen runtime database boundary，代表本地 TS runner 的 restart hook 证据；生产进程管理和 formal soak 仍需后续 Gate D。
4. No-overwrite writer 保证报告文件存在时 fail closed；第一次报告发现 seed bug 后不覆盖，改用 v2 报告作为最终证据。
5. Seed 修复后保证 scoped conversation key 唯一，同时保留跨 scope `conversationId` collision 压力用例。

## 修复点

- 初次实跑发现 SQLite `conversations=5000`，原因是 seed generator 对部分 `conversationId` 在同一 tenant/user scope 内重复，`INSERT OR IGNORE` 造成实际 conversation 少于 `seededConversations`。
- 修复 [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)：同一 `conversationId` 的碰撞只跨 tenant/user scope 发生，不在同一 scoped key 内重复。
- 新增 [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts) 最小复现：`seededConversations=8` 必须产生 `8` 个唯一 scoped conversation keys，同时保留 cross-scope collision。

## 最终证据

- Final report：[2026-07-09-local-short-baseline-v2.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline-v2.json)
- Verification report：[task12d-local-short-baseline-run.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12d-local-short-baseline-run.md)
- Superseded report：[2026-07-09-local-short-baseline.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline.json)

Final v2 摘要：

- `track=local`
- `result=local_verified`
- `samples=60`
- `failures=[]`
- `reportHash=da12fb2fdc458cd4575f23493bd35dcb2ed996c32f017edcbae982e94404cddf`
- `fileSha256=4a73980cf7b9687bbfe79a7ed5a5501c764c8371dac20fa115f11fe32464c6bc`
- SQLite rows：`conversations=10000`、`executions=10000`、`runtime_events=10000`

## 验证摘要

- Focused Task 12：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler localShortBaselineRunner localShortBaselineExecution`，`4` files / `12` tests passed。
- Runtime full：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test`，`63` files / `306` tests passed（非沙箱重跑）。
- Shared schema：`/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test`，`49` tests passed。
- Root typecheck：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck`，shared-schema / agent-runtime / frontend 均通过。
- Secret scan：v2 report 无 `OPENHARNESS_SECRET_CANARY`、`sk-` 或 `Bearer ` 命中。

## 待办 / 门禁

- Gate B 仍需生产 backup/import/quarantine/restore/RPO/RTO 证据；Task 12D 不会后台关闭 Gate B。
- Gate D 仍需 formal 24-hour soak；Task 12D 只是本地 30-minute short baseline。
- Stage 3 4.2/4.5/4.6 仍未完成，不得 archive OpenSpec change。
