# Agent Runtime 60 分钟恢复回归 Attempt 004 结果 Review

## 结论

**需修改。** Attempt 004 在冻结源码、固定 10,000 scopes / concurrency 20 / 60 分钟 workload、真实 Java Gateway、production Runtime、MCP 与 SQLite 链路下自然完成 120/120 样本。持久化正确性、durable replay sustained gate、trace outbox、Java sink 容量、RSS、FD、WAL、MCP child、formal-incremental oracle、credential scan 与进程清理均通过；唯一 hard failure 仍为 `SUSTAINED_THRESHOLD_BREACH(admissionP95Ms)`。

Attempt 003 后实施的 trace acknowledgement 单批事务显著降低了 acknowledgement transaction acquisition 数量，Java 有界 sink 将正式日志增长从约 1.85 GB 降到 10,331 bytes，但 admission 指标没有 material improvement。因此“逐事件 acknowledgement 写事务是 admission 退化的唯一主因”已被本轮证据否定。当前不得标记 `local_verified`、不得归档 active OpenSpec change，也不得发起正式 24 小时 Gate D。

## Review 范围

- [Attempt 004 执行计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-004.md)
- [Attempt 004 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-004-preflight-review.md)
- [Attempt 004 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004-report.json)
- [Attempt 004 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004-journal.jsonl)
- [Attempt 004 SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- [Attempt 004 Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/java-gateway-18084.log)
- [冻结 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/run-60m-recovery-regression.ts)
- [trace outbox batch acknowledgement](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [Java TraceService 有界 sink](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/service/TraceService.java)
- [SQLite Runtime adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)

## 主要发现

### Critical

无数据损坏、隔离泄漏、credential 泄漏、dead-letter、进程泄漏或证据污染 Critical。

### Important

1. **Admission sustained gate 仍失败。** 120 个样本中 96 个超过固定 `100ms` 阈值，最长连续越线 93 个样本；全程 median `145.273ms`、max `470.625ms`。首四分位 median `81.059ms`，末四分位 median `182.760ms`，退化随运行时长持续。
2. **Attempt 003/004 admission 几乎相同。** Attempt 003/004 median 分别为 `144.157/145.273ms`，越线样本均为 96，最长连续越线分别为 95/93。单批 acknowledgement 没有恢复 admission gate，不能继续将逐事件 acknowledgement 视为唯一主因。
3. **Admission 与 replay 共享剩余瓶颈。** 本轮 admission 与 durable replay 的 Pearson correlation 为 `0.902`，admission 与数据库体积 correlation 为 `0.740`；admission 与 oracle duration correlation 为 `-0.526`。这支持共享 Runtime/SQLite 请求路径随数据库增长退化，并反对 formal oracle 是本轮主因。
4. **只读 adapter 仍进入写事务。** production `history.get/list`、`memory.list/search`、`executions.get/getActive`、`approvals.get/listPending` 与 `events.since/latest/hasEvent` 均通过 `database.transaction()` 执行；该 transaction 固定使用 `BEGIN IMMEDIATE`。因此 active-conflict 检查和每次 session replay 都竞争 SQLite 单写锁，即使 repository 只执行 `SELECT`。这是下一轮必须先证实或否定的明确事务边界问题。

### 已通过的 gate

- `runComplete=true`，实际采样 `3,600,841.304ms`，120/120 samples；
- source start/end SHA 均为 `134d14a6757b2e9da3fb0197dbf1cc68412133a46c6d7ab536dd6de0fe3958c3`；
- runner SHA `b213db1ba6cafae81274e3f9b0d96ecedb01bab3da2fd2c28d284e22c5962636`；
- plan SHA `e61483e7b898b275726a18c0e809aeacc0520a123716ff7617d68e0c8395ed06`；
- MCP config SHA `05dfe50604bb56e4498f051cdf11016d2d93411a24ac06152776841dd60da0ad`；
- durable replay median `151.976ms`、max `492.712ms`；25 个单点越线但最长连续仅 2，没有 sustained failure；
- Runtime RSS max `1,230,323,712 bytes`，低于 1.5 GiB；
- FD max `122`，低于 1,024；
- WAL max `9,644,952 bytes`，低于 256 MiB，结束后 WAL 为 0；
- trace backlog median `39`、max `289`、末值 `118`，retry max `0`、dead-letter max `0`；
- formal-incremental oracle median `89.067ms`、max `473.298ms`，七类 probe 无 hard failure；
- SQLite main 结束时 `4,092,813,312 bytes`，`PRAGMA integrity_check=ok`；
- Runtime event high watermark `6,149,959`，message high watermark `1,032,157`，execution high watermark `512,351`；
- Java log 从 `3,853` 增到 `14,184` bytes，report 记录增长 `10,331` bytes；相对 Attempt 003 的 `1,849,536,286` bytes，增长量下降约 `99.9994%`；
- report/journal/log 的 Bearer、`sk-`、`OPENHARNESS_SERVICE_TOKEN=` 等 credential marker 负向扫描命中文件数为 0；
- Runtime、MCP 与 Java 均已停止，端口 `3102`、`18084` 已释放；失败 evidence 保持原位且未覆盖。

### Advisory

1. report 内部 `reportHash=eb65c36100d488f831e3fd67dd6fe2c264933ce90d50c1a2a5efb70c29603778` 是 runner 对不含自引用 hash 字段的 canonical payload 计算结果；完整 JSON 文件 SHA-256 为 `891b178b938a973bf6a62bd84c6b629b0213ca133b001c70606ac396f7f74c03`，二者用途不同，不构成证据矛盾。
2. 本轮 Java sink、storage monitor 与 batch acknowledgement 的独立实现价值保留；性能 gate 未通过不表示应回滚这些已验证的正确性和容量修复。
3. 不应直接执行 Attempt 005。必须先用 RED/GREEN 测试锁定只读 adapter 不再调用 `BEGIN IMMEDIATE`，再做短时生产链路回归；只有短时结果恢复固定阈值且数据库增长斜率受控，才允许新一轮 60 分钟回归。

## 最终建议

在现有 active OpenSpec change 内实施一个最小的 **SQLite read-path transaction recovery**：

1. repository 写方法继续使用既有 `database.transaction()` / `BEGIN IMMEDIATE`；
2. 单条或同步成组的纯读 adapter 直接使用 `RuntimeDatabase` 的 `get/all` 能力，不获取写锁；
3. 不改变 API payload、scope、durable replay、session history、outbox、schema、retention、workload 或固定阈值；
4. 先用 instrumented fake database 写 RED 测试，证明当前纯读 adapter 会进入写事务；GREEN 后证明各 reader 零写事务且所有写 adapter 仍进入事务；
5. 再执行 focused tests、workspace tests、typecheck 与一个不超过 10 分钟的真实短回归，用 admission/replay 和数据库增长相关性决定是否具备 Attempt 005 重跑资格。

## 后续门禁

- **OpenSpec proposal：** 不需要新增 proposal；建议修复不改变外部契约或持久化语义，是 active `harden-agent-runtime-single-node-production` change 内的事务边界修正。
- **Superpowers plan：** 必须新增单次 TDD 实施计划并在改源码前完成 plan Review。
- **测试：** 必须执行 RED/GREEN、受影响 focused tests、Runtime workspace tests、TypeScript typecheck、OpenSpec strict、dashboard check、短时 production 回归；通过短回归后才允许 Attempt 005。
- **人工审批：** 本地诊断和修复继续使用用户已授予的全程实施权限；正式 24 小时 Gate D start 与结果 promotion 仍不得预授权。
- **归档：** active OpenSpec change 保持 active；任务 4.2/4.3/4.5/4.6/5.2/5.3/5.4 不得勾选。
- **Dashboard：** 当前没有达到 `verified`，不修改 `development-log.json`。
- **项目规则：** 本 Review 未修改项目规则。
