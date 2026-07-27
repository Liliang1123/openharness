# Agent Runtime 10 分钟成熟数据库回归 Attempt003 Preflight Review

## 结论

通过：允许执行 `gate-r5-20260724-mature-003`。该运行只验证 main stream admission recovery 是否达到既定成熟库资格，不代表 Attempt005、正式 24 小时 Gate D、production promotion 或 OpenSpec 完成。

## Review 范围

- [Attempt003 evidence 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-003/)
- [冻结的短回归 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/run-10m-mature-database-regression.ts)
- [冻结的 MCP 配置](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/mcp-config.json)
- [Stream recovery plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-stream-admission-recovery.md)
- [Stream recovery Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-stream-admission-recovery-implementation-review.md)
- [Attempt002 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-002-result-review.md)
- [Attempt003 成熟 clone](file:///private/tmp/openharness-gate-r5.0mM6fP/gate-r5-20260724-mature-003.sqlite)，运行完成后按精确 prefix 校验清理。

## 主要发现

### Critical / High

无。

### Medium

1. runner 从 [agent-runtime 工作目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/) 启动，child loader probe 与完整 `--validate-only` 均 exit `0`。
2. Attempt003 使用 Attempt004 主数据库的新 APFS clone；不复用 Attempt002 的已运行 clone，不 seed、不清空、不改变 workload、threshold、outbox 或 oracle。
3. source state 已包含 main stream `durable start → header flush → current execution drain` 修复和确定性时序测试；runner、MCP 与原数据库 hash 保持冻结。

### Low

1. 独立 production business probe 已验证双 execution main stream：header admission `19.769ms` / `2.844ms`，每流 12 个当前 execution events，4 条 stable messages，cross-user `404`，SQLite integrity `ok`。

## Preflight 证据

- Run ID：`gate-r5-20260724-mature-003`
- Java Gateway：`http://127.0.0.1:18084`，health 与固定 fixtures 通过
- MCP fixture：通过，配置权限 `0600`
- Runtime 端口 `3102`：无监听
- child loader probe：exit `0`
- runner `--validate-only`：exit `0`
- 成熟 clone：`4,092,854,272` bytes
- clone SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`
- 精确 10,000 scoped conversations：通过
- `PRAGMA integrity_check = ok`
- dead-letter：0
- Source state SHA-256：`0b057a8d9e5fe607e2ecb0246249572bebd3dde90b7fe32002e256fa3b82f327`
- Runner SHA-256：`e3ca724fa8a4730c6085f21c3487458b718fba8d65f31cfe19fc249d349bf4d2`
- Plan SHA-256：`85e55b2b4f4f8468cab0bd34b7f87b82b07ef74889b53331f37efc4596c1e026`
- MCP config SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`

## 最终建议

执行固定 10 分钟/20 样本。资格保持：

1. 20/20，无 correctness/readiness/process/credential hard failure；
2. admission median `<=100ms`，连续超限 `<=2`；
3. replay median `<=250ms`，连续超限 `<=2`；
4. 相对 Attempt004 末四分位 `182.760ms` 改善至少 30%。

## 后续门禁

- 本 Review 不修改项目规则、OpenSpec task 或 Dashboard。
- 运行后必须落盘独立结果 Review并完成 Runtime/Java/MCP/clone cleanup。
- 通过只授权 Attempt005 plan/preflight；正式 Gate D、promotion、归档仍阻塞。
