# Agent Runtime Gate R1 窄诊断实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 串行执行；原始 Gate R1 SQLite 仅允许 readonly 打开，临时克隆不得进入项目目录。

**目标：** 不重复 90 分钟 workload，用两个有边界微基准区分 session replay 双读与 pending outbox index 对共同退化的贡献。

**依据：** [三变量诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-three-variant-diagnosis-review.md)。

## 边界

- 原始输入固定为 [incremental SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-incremental-001.sqlite)。
- 不启动 Java、Runtime、MCP 或 workload。
- 不修改源码、OpenSpec、Dashboard、原始 SQLite、三个 report 或 analyzer decision。
- replay 微基准用 `better-sqlite3` readonly 打开原始 SQLite；执行前后校验 inode、size、mtime 与 sidecar absence。
- outbox A/B 只使用 `/private/tmp/openharness-gate-r1-outbox.*` 下的 APFS clone；结果落盘后删除精确临时目录。
- 最终机器可读结果写入 [targeted diagnosis](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260724-targeted-diagnosis.json)，mode `0600`、no-overwrite。

## Task 1：readonly replay 单读/双读微基准

从 [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/) 运行一个内联 Node 脚本：

1. readonly 打开输入 SQLite；
2. 选择 event cardinality 最大的一个 scope；
3. 准备与 `SqliteRuntimeEventStore.replayAfter(..., null)` 相同的 indexed query；
4. 每次完整 decode `payload_json`；
5. warm-up 100 次；
6. 交替执行 2,000 轮 single-read 与 double-read；
7. 输出每轮 duration 的 median、p95、ratio 和每次 row count。

判定：

- double-read median 或 p95 至少为 single-read 的 `1.8x`，确认重复全量 replay 是直接 CPU/query amplification；
- 小于 `1.2x` 则拒绝该假设；
- 中间值为 contributing，仍不得单独定为主因。

## Task 2：pending outbox index 插入 A/B

1. 使用 `mktemp -d /private/tmp/openharness-gate-r1-outbox.XXXXXX` 创建精确临时目录；
2. `cp -c` 创建 `with-index.sqlite` 与 `without-index.sqlite`；
3. 仅在 `without-index.sqlite` 执行 `DROP INDEX runtime_event_outbox`；
4. 两个 clone 各自选择同一个已存在 scope/execution 和 `MAX(cursor)`；
5. 交替执行 6 轮、每轮 10,000 条 deterministic pending event insert；
6. 每轮使用 `BEGIN IMMEDIATE`，计时 insert loop，随后 `ROLLBACK`，保证每轮相同基线；
7. 输出 with-index / without-index median、p95 与 ratio；
8. 捕获结果后删除两个 clone 和精确临时目录。

判定：

- with-index median 或 p95 至少比 without-index 高 `20%`，确认 expanding pending partial index 对写入/admission 有 material contribution；
- 小于 `10%`，判定为 correctness/capacity 缺陷但不是本轮 admission 主因；
- 10%–20% 为 contributing。

## Task 3：落盘 evidence 与 Gate R1 最终诊断 Review

使用 `apply_patch` 创建 machine-readable JSON，至少包含：

```json
{
  "schemaVersion": 1,
  "track": "local",
  "evidenceKind": "gate-r1-targeted-performance-diagnosis",
  "sourceDatabaseBasename": "gate-r1-20260723-incremental-001.sqlite",
  "replay": {
    "iterations": 2000,
    "rowsPerRead": 0,
    "singleReadMedianMs": 0,
    "singleReadP95Ms": 0,
    "doubleReadMedianMs": 0,
    "doubleReadP95Ms": 0,
    "medianRatio": 0,
    "p95Ratio": 0
  },
  "outboxIndex": {
    "rounds": 6,
    "insertsPerRound": 10000,
    "withIndexMedianMs": 0,
    "withIndexP95Ms": 0,
    "withoutIndexMedianMs": 0,
    "withoutIndexP95Ms": 0,
    "medianOverheadRatio": 0,
    "p95OverheadRatio": 0
  },
  "decision": {
    "primaryCause": "session-replay-growth | outbox-index-growth | combined | unresolved",
    "nextOpenSpecDecision": "existing-change | new-proposal-required"
  }
}
```

随后创建 [Gate R1 最终诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-final-diagnosis-review.md)，必须包含结论、范围、主要发现、最终建议与后续门禁。

## 完成标准

- 原始 SQLite inode、size、mtime 与 sidecar 状态未变化；
- 两个微基准都有 6/2,000 轮有效输出；
- 临时 clone 已精确删除；
- machine-readable evidence 为 mode `0600`；
- Gate R1 最终诊断 Review 能选择 existing change 下的具体 TDD 修复路径，或明确要求新 proposal。
