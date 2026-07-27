# Agent Runtime 10 分钟成熟数据库回归 Preflight Review

## 结论

通过：允许执行唯一一次 `gate-r5-20260724-mature-001` 本地 10 分钟成熟数据库短回归。该结论只授权 Attempt005 准入验证，不代表 OpenSpec `local_verified`、正式 24 小时 Gate D、production promotion 或 change 归档。

## Review 范围

- [短回归 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/run-10m-mature-database-regression.ts)
- [MCP 固定配置](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/mcp-config.json)
- [读路径恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-read-path-contention-recovery.md)
- [读路径恢复 Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-read-path-contention-recovery-implementation-review.md)
- Attempt004 成熟 SQLite 主文件的 APFS clone：[gate-r5-20260724-mature-001.sqlite](file:///private/tmp/openharness-gate-r5.x0jXYJ/gate-r5-20260724-mature-001.sqlite)。该临时路径仅用于本次运行，结束后按固定 prefix 校验删除；不作为持久项目制品。

## 主要发现

### Critical / High

无。

### Medium

1. runner 使用 Attempt004 已验证高水位作为本轮增量 oracle 起点，不把约 615 万条历史 event 再次物化进 Node heap。该边界只信任已经完成的 Attempt004 历史 correctness evidence；本轮仍对新增 event 执行 cursor ordering、batch duplicate、dead-letter、orphan approval、`SQLITE_BUSY`、secret canary、scope isolation 与最终 `PRAGMA integrity_check`。
2. 本轮报告继续复用 `RuntimeBaselineReport` 的 `local` track，因此 schema 在无 failure 时会产生 `local_verified` 字面值。runner 已把 `qualificationBoundary` 固定为 `attempt-005-eligibility-only`；最终 Review 必须按该边界解释，不得据此更新 OpenSpec 为完成、同步 Dashboard 为 verified 或批准正式 Gate D。

### Low

1. 独立 `tsc` 单文件命令会把既有源码脱离项目 tsconfig 重新解析并产生 NodeNext / Zod 既有类型噪音，因此不作为本 runner 门禁。runner 已通过真实 `tsx` import 与完整 `--validate-only` 执行路径验证；项目源码本身此前已通过正式 `pnpm typecheck`。
2. Java Gateway 由当前隔离 shell 维护，Runtime 子进程由 supervisor 维护。运行结束后必须分别验证 `3102`、`18084` 无监听，并清理 Maven/Java 与 MCP 子进程。

## Preflight 证据

- Run ID：`gate-r5-20260724-mature-001`
- Java Gateway：`http://127.0.0.1:18084`，health、固定 Java fixtures 通过。
- Runtime 端口：`3102`，执行前无监听。
- MCP fixture：启动、协议探测、退出均通过；配置权限 `0600`。
- 成熟 clone 大小：`4,092,854,272` bytes。
- 原主文件与 clone SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`，一致。
- 临时卷可用空间：约 `136 GiB`，高于 runner 的 `2,000,000,000` bytes 最低门槛。
- `--validate-only`：exit `0`。
- Source state SHA-256：`63dc5c97f14670cc282b2f02180d3569adc5678178bbbca4b44affff210025e3`
- Runner SHA-256：`e3ca724fa8a4730c6085f21c3487458b718fba8d65f31cfe19fc249d349bf4d2`
- Plan SHA-256：`9e02b8518903f2cbc7f86eb0e3950b7791e97ad897b5ae5268013de304a8cbef`
- MCP config SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`
- 成熟库检查：精确 10,000 scoped conversations、`PRAGMA integrity_check = ok`、dead-letter 为 0。
- 本轮禁止项已固化：不 seed、不清空成熟库、不修改 10,000 scopes / concurrency 20 / 60-20-15-5 workload、不改 latency/resource threshold、不禁用 outbox 或 oracle。

## 最终建议

按已绑定 runner 与配置直接运行 20 个、每 30 秒一个样本。只有同时满足下列条件，才可进入 Attempt005：

1. 20/20 samples，且无 correctness、readiness、process、credential hard failure；
2. admission p95 median `<= 100ms`，连续 `> 100ms` 不超过 2；
3. replay p95 median `<= 250ms`，连续 `> 250ms` 不超过 2；
4. 相对 Attempt004 末四分位 admission median `182.760ms` 改善至少 30%；
5. 运行后 source、runner、plan、MCP binding 未漂移，Runtime/Java/MCP 全部清理。

任一条件不满足时保留 report/journal，停止 Attempt005 并回到证据驱动诊断。

## 后续门禁

- 当前仍有 active OpenSpec change：`harden-agent-runtime-single-node-production`。
- 本 Review 不修改项目规则、OpenSpec task、Dashboard 或生产状态。
- 本轮运行完成后必须落盘独立结果 Review。
- 只有结果 Review 为通过，才允许生成 Attempt005 的 plan/preflight；正式 24 小时 Gate D 与 production promotion 仍需各自门禁和明确适用授权。
