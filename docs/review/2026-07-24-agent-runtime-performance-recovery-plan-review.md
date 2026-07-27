# Agent Runtime 性能恢复实施计划 Review

## 结论

通过：计划 SHA-256 为 `e8eb004b8faa844c5ef40e09f0878e9e273d7951252050f3dca52406a18f25e6`。计划将既有 Gate R1 诊断结论收敛为五个可独立验证的 TDD 切片，范围完全落在 active OpenSpec change `harden-agent-runtime-single-node-production` 已批准的 replay、durable outbox、readiness 和 Gate D qualification 语义内，可以开始实施。

## Review 范围

- [性能恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-performance-recovery.md)
- [Gate R1 最终诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-final-diagnosis-review.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Agent Runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [runtime storage schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [trace outbox batch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [Gate D formal execution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)

## 主要发现

### Critical

无。

### Important

- session detail 切片以“单请求只调用一次 scoped `since(null)`”作为行为测试，直接封住已量化为约 `2x` 的同步 query/decode 放大，同时保留 runtime progress 结果 oracle。
- schema v2 将 replay event 与 Java outbox eligibility 明确分离；trace-only due claim、ordered partial index 和非 trace `not_applicable` migration 能同时消除 starvation 与无界 pending index 增长。
- dispatcher 计划覆盖 start、bounded concurrency、non-overlap、retry、dead-letter、restart resume、close order 和 readiness，不再把已有单批 helper误当成完整生产 lifecycle。
- event-scoped Java headers 复用 committed identity，并保持 service token 只存在于闭包/header 构造边界；这符合项目 MCP/内部服务 auth 不变量。
- formal-incremental mode 保留原七个 timing 与 hard-failure 分类，同时把 event/message canary 限制到新 row；duplicate identity 由 schema unique constraints、startup integrity 和 cursor 内部检查共同覆盖，不再需要每 sample 全库聚合。
- production-sized v1 → v2 clone rehearsal 已纳入正式验证，可在不改变历史 Gate R1 SQLite 的情况下提前发现 migration 时间、空间或 query-plan 风险。

### Minor / 非阻塞风险

- Fastify 多个 `onClose` hook 的实际执行顺序不得依赖记忆；实现必须用 lifecycle test 观测 dispatcher 已停止后 SQLite 才关闭，并在需要时用单一 owner hook显式编排。
- dispatcher 的默认 retry 次数、间隔和并发值属于内部 production policy。实现必须固定、测试并保持 bounded；若实施时需要引入运维可配置项或人工 dead-letter resolution API，应重新做 OpenSpec 边界判断。
- v2 migration 会更新历史非 trace pending rows并重建 partial index；production-sized clone rehearsal未通过前不得启动 60 分钟恢复回归，更不得开始 Gate D。
- `formal-full` 只能保留为历史诊断能力，正式 executor 必须显式选择 `formal-incremental`，避免默认值日后被误改。

## 最终建议

按 Task 1 → Task 5 串行执行，每个切片保留真实 RED 失败与 GREEN 通过输出。先完成 session replay 和 schema/outbox correctness，再接生产 dispatcher；正式 oracle 最后改造，以免多个性能变量同时变化时失去定位能力。任何 auth/scope 泄漏、migration integrity 失败、dead-letter 未降级 readiness、dispatcher close 后仍调度或正式 oracle hard-failure 语义丢失，都应立即停止进入 systematic debugging。

## 后续门禁

- **OpenSpec proposal：** 不需要新增；继续使用 active change `harden-agent-runtime-single-node-production`。若增加 operator resolution API、改变 retention、外部 API 契约或可配置 retry policy，必须重新判定。
- **Superpowers plan：** 本计划已通过，可以执行。
- **测试：** 强制 TDD、focused tests、Runtime/workspace full tests、typecheck、backend Maven、OpenSpec strict、Dashboard check 和 production-sized clone rehearsal。
- **实现 Review：** 全部实现验证通过后必须另行落盘 High Review；未通过不得创建 60 分钟恢复回归执行计划。
- **24 小时 Gate D：** 本计划不授权开始，也不允许把任何短测结果晋升为 Gate D PASS。
- **Dashboard：** 当前不是 `verified` 同步点，不修改。
- **项目规则：** 未修改。
