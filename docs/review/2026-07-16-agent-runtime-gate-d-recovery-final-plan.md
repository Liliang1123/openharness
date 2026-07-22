# Agent Runtime Gate D 性能失败恢复最终计划

## 结论

需修改：当前唯一正确决策是**暂停任何正式 Gate D 重跑与发布动作，先执行一个有边界的 admission 性能根因诊断切片**。第 002 次运行已经证明固定 workload 下的 Runtime admission 和 durable replay 会随运行时间同步退化；在根因未确认前直接修改索引、阈值、并发、采样器或持久化行为都属于猜测性修复。

本计划把后续工作拆为六个顺序门禁。当前只授权进入 Gate R1（根因诊断）；Gate R1 未通过前不得生成具体修复、不得启动新 Gate D。根因确认后，在现有已批准的 `harden-agent-runtime-single-node-production` OpenSpec change 边界内生成独立 Superpowers 修复计划并实施。只有新的定向回归通过，才请求新的 Gate D 启动审批。

## Review 范围

- [功能工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [第 002 次 Gate D 失败 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-attempt-002-failure-review.md)
- [第 002 次 immutable partial report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/partial-report.json)
- [第 002 次 evidence journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/journal.jsonl)
- [第 002 次本地 SQLite 诊断制品](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [现有总实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Gate D production executor 计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Gate D workload 执行器](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Gate D runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [生产 Server wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [SQLite Runtime adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Trace outbox 实现](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/traceOutbox.ts)

## 主要发现

### Critical — admission 与 replay 同步随数据量退化

- 第 002 次运行首样本 `admissionP95Ms ≈ 13.37ms`、`durableReplayP95Ms ≈ 11.09ms`。
- 第 40 个样本 admission 首次超过固定 100ms；第 49 个样本约为 `153.85ms`，连续 300 秒越限触发 hard fail。
- 同一末样本 durable replay 已升至约 `202.15ms`，说明问题不是单一网络握手抖动，数据库读取、事件回放、事务竞争或证据探针至少有一项随数据增长退化。

### Critical — 运行数据增长速度不可忽略

第 002 次本地 SQLite 制品在约 24 分钟内达到约 1.7GiB，包含：

| 表 | 行数 | 约占用 |
|---|---:|---:|
| `runtime_events` | 2,671,288 | 1.21GiB（不含索引） |
| `messages` | 443,548 | 57MiB |
| `executions` | 220,649 | 29MiB |
| `approvals` | 7,000 | 2.5MiB |
| `conversations` | 10,000 | 0.8MiB |

若增长斜率不变，24 小时制品量级约为 100GiB。该数字不是正式容量预测，但足以要求在重跑前证明增长是受控且不会再次拖垮 admission/replay。

### Important — 三个根因候选必须逐项隔离

1. **全表证据扫描竞争。** [Gate D workload 执行器](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts) 每 30 秒对持续增长的 `runtime_events` 执行 dead-letter、duplicate、`SQLITE_BUSY`、secret canary 等全表或全索引扫描。离线制品上单次 duplicate scan 约 1.7 秒，且运行中会与 Runtime 争用 CPU、page cache 和磁盘带宽。
2. **Durable session detail 全量读取。** [生产 Server wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts) 的 session detail 同时读取完整 messages、全部 scoped events、active execution 与 pending approvals；[SQLite Runtime adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeAdapters.ts) 的 `since(..., null)` 会从 cursor 0 回放整段事件。每个 conversation 的历史持续累积时，durable replay 成本会线性增长。
3. **Outbox 状态/生产 wiring 缺口。** 第 002 次制品中的 2,671,288 条 `runtime_events` 全部为 `pending`，没有 `delivered`、`retry` 或 `dead_letter`。代码中存在 [Trace outbox 实现](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/traceOutbox.ts)，但当前生产 Server wiring 未显示持续 dispatcher 生命周期；同时所有 runtime event 默认进入 pending，而 dispatcher 仅处理 `trace` kind。必须确认这是预期证据模型、未接线缺陷，还是与增长/竞争共同作用的合同缺口。

### Important — 当前不应先做的事

- 不降低 `admissionP95Ms ≤ 100ms`、不缩短 24 小时、不降低 20 concurrency、不改变 60/20/15/5 mix。
- 不删除第 002 次 packet、partial report、journal 或 SQLite；不把 FAIL 改写为 advisory/PASS。
- 不在根因未确认时直接增加随机索引、分页、retention、采样间隔或批处理参数。
- 不把 short/local regression 当成 Gate D production evidence。
- 不 archive active change，不同步 Dashboard 为 `verified`，不合并 `main`，不创建 `v1.0.0` tag，不清理工作树。

## 最终建议

### 现在的明确决策

**选择“先诊断、后修复、再做 60 分钟定向回归、最后重跑 24 小时 Gate D”的主路径。**

不建议现在重跑 Gate D，也不建议先选择某个优化方案。当前下一项任务只有一个：完成 Gate R1 根因诊断并落盘诊断 Review。该任务可以直接继续，不需要新的 OpenSpec，也不需要 Gate D production 启动审批。

## 分阶段执行计划

### Gate R0 — 证据冻结与执行边界

**状态：PASS。**

已满足：

- 第 002 次失败证据已经提交并推送，提交为 `cccd964a723a0606178c1863f6701c8483be6f8e`。
- 失败 SQLite 和 lock 文件保持未跟踪，本计划不得编辑、暂存、移动或删除它们。
- Java Gateway 与 Runtime 已停止，没有后台自动重跑。

后续所有实验必须使用新建的临时/诊断数据库，不得直接写第 002 次 SQLite。

### Gate R1 — 根因诊断（下一步，必须先做）

**目标：** 用可重复的 A/B 证据确认 admission/replay 退化的主因与次因；不实施生产修复。

#### R1.1 建立只读事实基线

- 对第 002 次 SQLite 使用 immutable read-only 方式记录表/索引大小、行数、event kind、delivery status、每会话 messages/executions/events 分布。
- 对 admission、session detail、event replay、sample-time database oracle 建立调用链图，标出每个事务和查询。
- 记录关键 SQL 的 `EXPLAIN QUERY PLAN` 与离线耗时；至少覆盖 duplicate scan、dead-letter scan、secret scan、per-session replay、history get、active execution 与 pending approval。

**产出：** 一份只读诊断 evidence；不得修改源文件或数据库。

#### R1.2 建立可重复的短周期退化复现

- 使用新数据库运行与 Gate D 相同的 10,000 conversations、20 concurrency、60/20/15/5 mix 和真实 Runtime/Java/MCP 本地链路。
- 该运行只标记为 local diagnostic；允许缩短总时长，但不得称为 Gate D。
- 增加分段计时观测：chat admission 内的 active-conflict lookup、execution create transaction、首次 stream flush；session detail 内的 active/pending/events/history/runtime-progress；采样器每个数据库 oracle。
- 复现成功标准：在不改合同阈值的情况下重现 admission/replay 随 event/message/execution 数量增长的趋势，或者证明第 002 次退化依赖某个特定探针/状态。

#### R1.3 单变量 A/B 隔离

按以下顺序，每次只改变一个诊断变量：

1. **Sampler A/B：** 相同 workload 下比较启用当前全量 database oracle 与仅采集增量 event rows；若 admission/replay 趋势显著分离，则确认采样竞争贡献。
2. **Replay A/B：** 比较 session detail 当前全量 events/messages 与只执行等价 SQL 计时、不改变 API 返回；确认历史长度对 replay 的贡献比例。
3. **Outbox A/B：** 比较 pending backlog 持续增长与受控 dispatcher/状态转换的诊断环境；确认 outbox index、后台处理或未处理 backlog 对写入/读取的贡献。
4. **Workload-only control：** 禁止采样器全表查询，仅保留 workload 和轻量 process metrics，验证基础 admission 是否仍随数据量退化。

这里的 A/B 是诊断实验，不是生产修复，也不能成为正式 Gate D 证据。

#### R1.4 根因判定门禁

Gate R1 仅在以下全部满足时 PASS：

- 至少一个根因假设被单变量实验确认，且有机制解释第 002 次两条延迟曲线。
- 其余候选被排除或量化为次因，不能只写“可能”。
- 明确修复是否改变外部 API、retention、持久化语义、outbox lifecycle、Gate D workload/threshold。
- 诊断 Review 落盘到 [Review 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/)，结论必须是 `通过`、`有风险` 或 `需修改`。

**停线条件：** 若三轮不同修复假设均未确认，或需要改变架构/持久化语义才能继续，停止并向用户提交架构选择，不得尝试第四个补丁。

### Gate R2 — OpenSpec 再判定与可执行修复计划

Gate R1 PASS 后再做一次 OpenSpec decision：

| 诊断结论 | OpenSpec 决策 |
|---|---|
| 修复当前全表探针为等价的增量/约束检查，不丢失 oracle | 沿用 active change |
| 接通 active spec 已明确要求的 durable outbox dispatcher/retry/dead-letter | 沿用 active change |
| 为已存在的 scoped query 增加索引或消除不必要全量 materialization，API/语义不变 | 沿用 active change |
| 改变 session detail 返回契约、event retention/删除策略、持久化 lifecycle | 新 OpenSpec proposal，审批前停止实现 |
| 改变 100ms/250ms 阈值、24h、20 concurrency、10,000 conversations 或 60/20/15/5 mix | 新 OpenSpec proposal，审批前停止实现 |

若可沿用 active change，创建新的单次可执行 [admission performance recovery Superpowers plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-recovery.md)。计划必须包含：

- RED 复现测试与预期失败；
- 单一最小修复，不夹带重构；
- 允许修改的精确文件；
- focused/full 验证命令与预期结果；
- 60 分钟 local regression 的 Go/No-Go 标准；
- rollback/park 方式；
- Step Evidence Gate 与独立 High Review；
- 禁止 Git commit/push、Gate D start、archive、merge、tag 的边界。

计划当前 revision 必须先经过 Preflight Review PASS，才允许实施。

### Gate R3 — TDD 修复与定向验证

**实施纪律：** systematic debugging → TDD RED/GREEN → focused verification → strict independent Review。

最低验证层级：

1. 根因专属 RED 测试先失败，证明测试可捕获第 002 次退化机制。
2. 最小修复 GREEN；不得同时修改无关 runtime 行为。
3. Agent Runtime focused tests、full tests、typecheck PASS。
4. 如修改 Java trace ingest/outbox wiring，相关 Java focused/full tests PASS。
5. SQLite integrity、scope isolation、duplicate/event ordering、approval/restart、outbox retry/dead-letter、secret negative scans PASS。
6. `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` PASS。
7. `pnpm dashboard:check` PASS；除非触发项目定义的同步节点，否则不修改 Dashboard 数据源。
8. `git diff --check` 与本次 scope/sensitive/untracked artifact 检查 PASS。

任一 Review finding 进入同范围 fix → verify → Review 循环，直到 PASS。

### Gate R4 — 60 分钟 local 定向回归

这是新 Gate D 前的硬性 Go/No-Go，不是 production evidence。

固定条件：新数据库、10,000 conversations、20 concurrency、60/20/15/5 mix、30 秒采样、相同 Runtime/Java/MCP 本地链路；不得改正式阈值。运行至少 60 分钟，覆盖第 002 次首次越限时间的两倍以上。

进入新 Gate D 的 Go 条件：

- 无 hard failure、无 `SQLITE_BUSY` 耗尽、无 cross-scope/duplicate/order/secret/reconciliation 问题。
- 所有样本 `admissionP95Ms ≤ 100ms`、`durableReplayP95Ms ≤ 250ms`。
- 最后 20 个样本 admission p95 建议保持 `≤ 80ms`，为 24 小时运行保留至少 20% headroom；若只是在 80–100ms 间贴线，结论为 `有风险`，不得自动进入新 Gate D。
- 延迟不再随 events/messages/executions 数量呈持续上升趋势；必须给出斜率或首尾窗口对比，而非只看最后一个样本。
- 数据库增长、pending/retry/dead-letter 分布与采样器自身耗时均被记录，并能合理外推到 24 小时磁盘/资源范围。
- 定向回归 Review PASS。

若失败，返回 Gate R1；不得叠加第二个未证实修复。

### Gate R5 — 新 Gate D 启动与运行

Gate R4 PASS 后才准备正式运行：

1. 选择全新未使用的 runId 和 no-overwrite packet；不得复用 `gate-d-20260716-002`。
2. 重新计算当前 Gate D plan/source/preflight binding；旧 approval 自动失效。
3. 重新检查 Java Gateway、fixtures、MCP config、磁盘余量、监控、interruption procedure、输出路径与无覆盖约束。
4. 落盘新的 start Preflight Review，必须 PASS。
5. 向用户请求**新的明确 24 小时 Gate D 启动审批**；没有审批不得 spawn Runtime child。
6. 执行完整 24 小时、30 秒采样、hours 2/12/22 TS-only restart；任一 hard failure fail-closed，保留 partial report，禁止自动重试。
7. 完整 PASS 后进行独立结果 Review，再请求单独的 promotion approval。

### Gate R6 — 发布闭环

只有 Gate R5 完整 PASS 且获得 promotion approval 后，按顺序执行：

1. 勾选 OpenSpec 4.2、4.3；运行 full TypeScript、Java、integration、OpenSpec、Dashboard、安全和 production qualification，关闭 4.5。
2. 冻结并文档化 Runtime v1 service/persistence contracts，关闭 4.6。
3. 执行 Project Learning Closeout、fresh final verification 与最终 High Review。
4. 同步 Dashboard 为 `verified` 并重新渲染；`pnpm dashboard:check` PASS。
5. 请求 archive 审批；归档 active change，生成 closeout，再同步 Dashboard 为 `archived`。
6. 分别请求并执行精确暂存/commit/push、合并 `main`、创建 `v1.0.0` tag。
7. 最后单独确认是否清理 [功能工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/) 与未提交 SQLite 制品。

Archive、merge、tag、worktree cleanup 不是 Gate D promotion approval 的隐含授权。

## 决策门禁总表

| Gate | 当前状态 | 通过条件 | 未通过时动作 |
|---|---|---|---|
| R0 证据冻结 | PASS | 失败证据不可变、诊断 DB 只读 | 停止并恢复证据边界 |
| R1 根因诊断 | NEXT | 单变量确认主因、量化次因、诊断 Review | 继续诊断，不写修复 |
| R2 修复计划 | BLOCKED | OpenSpec 再判定 + plan Preflight PASS | 新 proposal 或修订 plan |
| R3 TDD 修复 | BLOCKED | RED/GREEN、全套 focused/full、High Review PASS | 返回同范围修复循环 |
| R4 60 分钟回归 | BLOCKED | 固定条件、无越限、趋势稳定、有 headroom | 返回 R1，不启动 Gate D |
| R5 新 Gate D | BLOCKED | 新 runId/preflight/审批 + 24h PASS + promotion approval | 保留 FAIL，返回 R1 |
| R6 发布闭环 | BLOCKED | full qualification、freeze、closeout、archive/发布审批 | 不 archive/merge/tag |

## 后续门禁

- **OpenSpec proposal：** 当前不需要新增；若改变固定阈值、workload、API 返回契约、retention 或持久化/outbox lifecycle 语义，则必须新增并获批。
- **Superpowers plan：** 需要，但只能在 Gate R1 确认根因后生成具体可执行计划；本文件是恢复决策计划，不是猜测性修复授权。
- **测试：** 根因复现 RED、focused/full、60 分钟 local regression、新 Gate D 24 小时正式运行均为必需且不可互相替代。
- **人工审批：** 新 Gate D start、Gate D promotion、archive、Git publication、merge、tag、worktree/SQLite cleanup 分别需要明确授权。
- **Dashboard：** 本轮仅新增 Review 计划，不触发 `proposed`、`verified` 或 `archived` 同步点，不修改 Dashboard。
- **项目规则：** 本计划不修改任何项目规则。
