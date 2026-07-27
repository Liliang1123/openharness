# Agent Runtime 10 分钟成熟数据库回归 Attempt004 Result Review

## 结论

需修改。Attempt004 在 workload/sample 开始前 fail-close，未形成性能结论：4GiB mature clone 的 Worker bootstrap 约 86 秒后才监听，但共享 Gate D supervisor 的默认 readiness 窗口只有 120 × 250ms = 30 秒，因此正常启动中的 Runtime 被误判超时并终止。不得把本轮标记为 Worker/queue/admission 失败，也不得复用 runId、report、journal 或 clone；必须先 TDD 扩大“启动等待窗口”（不改冻结 admission/replay threshold），完成验证后使用新 runId 运行 Attempt004b。

## Review 范围

- [Attempt004 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/gate-r5-20260727-mature-004-report.json)
- [Attempt004 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/gate-r5-20260727-mature-004-journal.jsonl)
- [Attempt004 Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/java-gateway-18084.log)
- [Attempt004 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004-preflight-review.md)
- [Gate D supervisor readiness implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Gate D Runtime child](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- 已删除的 failed clone 原路径：[gate-r5-20260727-mature-004.sqlite](file:///private/tmp/openharness-gate-r5.enkEvJ/gate-r5-20260727-mature-004.sqlite)

## 主要发现

### High

1. Report 为 `fail`，只有 runner 追加的一个 synthetic failure sample；`actualSamplingDurationMs=0`，没有 admission、replay、Worker、queue 或 heartbeat observation。
2. Failure codes 仅为 `MATURE_REGRESSION_EXECUTION_FAILURE`、`MATURE_REGRESSION_SAMPLE_COUNT_MISMATCH`、`MATURE_REGRESSION_DURATION_INCOMPLETE`。初始/最终 high-watermark、database bytes 和 outbox 完全相同，证明 workload 未开始。
3. 共享 [waitUntilGateDRuntimeReady](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts) 默认最多 120 polls × 250ms。独立诊断使用相同 child/environment/clone，在约 86 秒后成功监听 3102；此前进程持续占用 CPU、持有唯一 SQLite/lock，并有一个 MCP fixture child，符合 Worker bootstrap 正在执行而非死锁或 crash。
4. 因 supervisor 在 30 秒处主动终止 child，journal 只有 `mature_database_bound` 和 `regression_completed`，没有 `runtime_started`；这是资格基础设施启动窗口不兼容，不是业务阈值失败。

### Medium

1. `--validate-only` 只做只读 clone integrity/source binding/Java/MCP probe，不启动 production Runtime，因此无法提前发现 Worker bootstrap 时间超过 supervisor timeout。
2. 修正方向只应扩大 startup readiness maximum polls 并增加超过旧 120 polls 后仍可成功的回归测试。不得改 10 分钟 duration、30 秒 sample interval、100ms admission、250ms replay、30% improvement、workload 或 correctness oracle。
3. 正式 24 小时 Gate D 使用同一个 supervisor；若不修正也会在 mature database cold startup 误判。

### Low

1. Report/journal/Java log 不含本地 service token、raw Bearer、`sk-` 或 canary evidence；源码中的 redaction matcher 字面量不属于泄漏。
2. 失败后 Runtime 3102、Java 18084 与 MCP child 均已停止；SQLite final integrity 为 `ok`。
3. Failed report SHA-256：`39e0561fb1cbdb80d435e05e5e9ae782b4a6a4982ec9b03335be87dc4aa8c712`。
4. Failed journal SHA-256：`a5f13ba649a8b05f3fc4ce9ab88578a3b884fd514be1134f06a72aac068d50f1`。
5. Java log SHA-256：`dfe47ce4f69421724b6baf1e4730119c7291a50ae8fa70389e239866461b671b`。

## 最终建议

按 systematic-debugging/TDD 单点修复 supervisor readiness：

1. RED：默认配置在前 121 次 probe 不 ready、第 122 次 ready 时应成功；当前 120-poll 默认必须失败。
2. GREEN：把默认 startup readiness 窗口提高到至少 180 秒，同时保留显式 `maximumPolls` override 与 authentication fail-fast。
3. 运行 focused/full matrix、OpenSpec strict、dashboard/diff checks并落盘修复 Review。
4. 创建全新 clone、report/journal/Java log 与 `gate-r5-20260727-mature-004b` Preflight；禁止覆盖或删除本轮 report/journal/log。

## 后续门禁

- OpenSpec：4.1d 继续未完成。
- Dashboard：继续 `proposed`。
- Attempt005：不得准备。
- 正式 Gate D：不得启动。
- Git / 发布：未授权。
