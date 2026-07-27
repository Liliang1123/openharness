# Agent Runtime Gate R1 窄诊断计划 Review

## 结论

通过：计划 SHA-256 为 `68c2bfd4a64741aa9d860fa3dfd5ed6a7ee586cab21f3264f3ea633b691d4a49`。计划只消费现有 immutable evidence 和 `/private/tmp` APFS clone，不重复已完成 workload，不改变源码或运行时契约，可以执行。

## Review 范围

- [窄诊断实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-gate-r1-targeted-diagnosis.md)
- [三变量诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-three-variant-diagnosis-review.md)
- [incremental SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-incremental-001.sqlite)
- [session detail implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Runtime storage schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)

## 主要发现

### Critical

无。

### Important

- replay benchmark 只做 indexed scope query 和 JSON decode，能直接量化 session detail 第二次 `since(null)` 的 query/CPU amplification。
- outbox benchmark 对相同数据库状态交替执行 with-index / without-index，并使用 transaction rollback 保持每轮相同基线；能隔离 `runtime_event_outbox` partial index 的写入成本。
- 原始 SQLite 不参与任何 transaction；临时 clone 不进入项目路径，不会与 evidence 或 Git 状态混淆。
- 1.8x replay 与 20% index overhead 的判定线在执行前固定，避免结果后移动门槛。

### Minor / 非阻塞风险

- APFS page cache 会影响绝对耗时；交替 6 轮和 ratio 判定能降低顺序偏差，结论只用于同机相对比较，不作为正式 Gate D 性能证据。
- 临时 clone 删除前必须先确认 machine-readable 结果已捕获；只能删除 `mktemp` 返回且通过 `/private/tmp/openharness-gate-r1-outbox.` prefix 校验的精确目录。

## 最终建议

按计划执行两个微基准，保留 stdout 原始数值，使用 `apply_patch` 创建 no-overwrite JSON evidence，再生成 Gate R1 最终诊断 Review。若任一原始 SQLite stat/sidecar 发生变化，立即停止并将诊断判为 `BLOCKED`。

## 后续门禁

- **OpenSpec proposal：** 当前不需要新增；结果若要求改变既有 API、retention 或 outbox 语义才重新判定。
- **Superpowers plan：** 本计划可执行；完成后仍需具体 TDD 修复计划。
- **测试：** 本轮仅为 local diagnostic，不替代修复测试、60 分钟回归或 24 小时 Gate D。
- **Dashboard：** 不修改。
- **项目规则：** 未修改。
