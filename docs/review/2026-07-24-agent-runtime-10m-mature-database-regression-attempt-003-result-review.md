# Agent Runtime 10 分钟成熟数据库回归 Attempt003 Result Review

## 结论

需修改：Attempt003 完成 20/20 样本，admission median `99.623ms`、replay median `103.581ms`、相对 Attempt004 改善 `45.490%`，均达到对应门槛；但最后 6 个 admission 样本连续高于 `100ms`，超过最长连续 2 的资格。唯一 report failure 为 `SHORT_REGRESSION_ADMISSION_CONSECUTIVE_BREACH`，禁止进入 Attempt005。

## Review 范围

- [Attempt003 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-003/gate-r5-20260724-mature-003-report.json)
- [Attempt003 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-003/gate-r5-20260724-mature-003-journal.jsonl)
- [Attempt003 Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-003/java-gateway-18084.log)
- [Attempt003 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-preflight-review.md)
- [Stream recovery Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-stream-admission-recovery-implementation-review.md)
- [Runtime SQLite configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [Lifecycle transaction implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)

## 主要发现

### High

1. admission p95 min/median/max：`90.803/99.623/123.274ms`。
2. samples 14–19 连续 6 次超过 `100ms`；资格上限为 2。
3. 前 5 admission median `94.133ms`，后 5 `112.303ms`；前 10 `96.191ms`，后 10 `106.612ms`。本轮没有形成 5 分钟 sustained breach，但后段退化明确存在。

### Medium

1. main stream recovery 相对 Attempt002 admission median `137.242ms` 降至 `99.623ms`，下降约 `27.41%`；相对 Attempt004 末四分位下降 `45.49%`。current-execution drain 与 header flush 已实质有效。
2. replay p95 min/median/max：`92.577/103.581/128.012ms`，0 个样本超过 `250ms`。
3. admission/replay correlation `0.9921`；admission/database-size correlation `0.7480`；admission/oracle `-0.3872`；admission/backlog `0.0670`。outbox 和 oracle 不是剩余趋势的主要解释。
4. 每 30 秒 completed executions 从首样本 `5,904` 下降到末样本 `4,907`，最低 `4,471`；admission 与 execution throughput correlation 为 `-0.9782`。这不是 workload 加速造成的 p95 抬升，而是相同 workload 的单操作成本增加。
5. 数据库从 `4,092,854,272` 增至 `4,921,409,536` bytes。当前 [Runtime SQLite configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts) 只显式设置 WAL、foreign keys 和 1,000-page autocheckpoint，没有配置 bounded page cache 或 mmap；10,000 scopes 上的 message/event cursor B-tree 随机工作集需要独立 A/B 验证。

### Low

1. 20 个 checkpoint 的 correctness/readiness/process hard failure 总数为 0。
2. RSS min/median/max：约 `319/450/686 MiB`；FD `88/100/109`；WAL max `8,005,192` bytes。
3. backlog min/median/max：`0/12/174`；最终 pending/retry/dead-letter 均为 0。
4. oracle duration min/median/max：`99.156/134.111/181.015ms`。
5. final SQLite integrity、source binding、credential scan、Runtime/Java/MCP cleanup 全部通过；fresh clone 已删除。

## 最终建议

先执行无源码变更的成熟 clone A/B：

1. Control：当前 SQLite connection defaults；
2. Candidate：bounded `64 MiB` page cache、`256 MiB` mmap，保持 WAL、foreign keys、autocheckpoint、synchronous durability 和 schema 不变；
3. 两侧从相同 Attempt004 主库 fresh clone 开始，使用相同 scope 顺序与真实 lifecycle transaction/event mix，记录分段 p50/p95、throughput、RSS、WAL、integrity；
4. candidate 若不能在后半段 p95 或 throughput 上取得至少 10% 且无资源/正确性退化，禁止实施，转向 lifecycle event transaction batching 诊断；
5. candidate 若通过，再按 TDD 把 bounded pragmas 写入 Runtime storage，并重新执行全量验证和成熟库短回归。

## 后续门禁

- active OpenSpec change 仍为 `harden-agent-runtime-single-node-production`。
- 本 Review 不修改项目规则、OpenSpec task、Dashboard 或正式状态。
- Attempt005、正式 24 小时 Gate D、production promotion 与归档继续阻塞。
- A/B 必须使用临时 clone，不能打开或修改原 evidence，结束后按精确 prefix 清理。
