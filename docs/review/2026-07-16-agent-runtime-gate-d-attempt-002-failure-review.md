# Agent Runtime Gate D 第 002 次运行失败 Review

## 结论

需修改：`gate-d-20260716-002` 已通过 active preflight 并启动真实 production Runtime workload，但在 49 个 30 秒样本、约 24 分钟后因 `admissionP95Ms` 连续至少 300 秒超过固定 100ms 阈值而 fail-closed。该结果不受“API-key Provider 缺失可作为 advisory”政策豁免，OpenSpec 4.2、4.3、4.5、4.6、5.2、5.3、5.4 必须保持未完成；当前不得 archive、合并 `main`、发布 `v1.0.0` 或清理承载失败证据的 worktree。

## Review 范围

- [第 002 次 Gate D packet](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/)
- [Preflight artifact](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/preflight.json)
- [Immutable partial report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/partial-report.json)
- [Evidence journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/journal.jsonl)
- [正式 Gate D runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [正式 workload 执行器](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Baseline 判定器](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localBaseline.ts)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [开发导航台数据源](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Critical

- Partial report 的唯一 hard failure 为 `SUSTAINED_THRESHOLD_BREACH`，metric 为 `admissionP95Ms`。固定阈值为 100ms，持续越限窗口为 300,000ms；`sampleIndex` 39–48（即第 40–49 个样本）连续 10 次越限，最终样本为约 153.85ms。
- Admission p95 从首样本约 13.37ms 随 workload 和持久化数据增长逐步升高。运行停止时 SQLite 文件约 1.71GiB，最后 Runtime RSS 约 666.7MiB；虽然 RSS、FD、WAL、MCP child 和 durable replay 均未触发各自 hard threshold，但 admission 延迟已经构成真实生产门禁失败。
- 本次失败发生在 2 小时首次 TS Runtime 重启之前，因此没有形成第 2/12/22 小时重启、完整 24 小时运行或最终正式报告制品，不能用此前 local database/sampler baseline 替代。

### Important

- Preflight 为 PASS，Java Gateway、真实本地 MCP stdio、10,000 scoped conversations、20 并发、60/20/15/5 workload 与证据 journal 均已进入正式执行；这不是第 001 次尝试中的路径配置错误。
- Journal 的样本 `hardFailures` 为空并不与最终结果冲突：持续阈值是在 report evaluator 基于连续样本计算的 report-level failure，而不是单样本 hard failure。
- 本次失败与模型 Provider 凭据无关。用户批准的 Codex OAuth 必选模型轨和 API-key advisory 豁免只能处理模型资格证据，不能把容量/延迟 Gate D 的 FAIL 改写为 PASS。
- Java Gateway 与 Runtime 已在失败后停止；没有自动重试。SQLite 数据库仅作为本地诊断制品保留，不应直接提交到 Git，因为文件约 1.71GiB。

## 最终建议

1. 保留 `gate-d-20260716-002` packet、journal 与 partial report 原样，禁止覆盖或改写为 PASS。
2. 以 admission 延迟随持久化数据增长为性能缺口开展独立诊断，重点检查会话读取、事件/消息查询索引、每次 admission 的事务与历史装载成本，以及 workload 是否持续累积无界历史。
3. 在不放宽固定阈值、不缩短 24 小时、不降低并发或 workload mix 的前提下完成修复和本地定向回归。
4. 修复后使用全新 runId、全新 no-overwrite packet、重新计算的计划绑定和新的明确启动审批；不得复用第 002 次审批，也不得自动重试。
5. 只有新的 Gate D 完整 PASS、人工 promotion approval、fresh final verification/独立 Review、全量生产资格验证、契约冻结与必需的 Review/closeout 全部通过后，才允许同步 Dashboard `verified`、archive、合并 `main`、打 `v1.0.0` 并清理 worktree。

## 后续门禁

- OpenSpec proposal：当前性能问题属于恢复已批准固定 Gate D 合同的缺陷修复，可在 active `harden-agent-runtime-single-node-production` change 内推进；若改变阈值、workload、持久化语义或外部契约，则必须先新增 OpenSpec proposal 并获批。
- Superpowers plan：需要先补充性能修复与短周期复现计划；不得把短周期测试作为正式 Gate D production evidence。
- 测试：先增加可复现 admission degradation 的失败测试，再实施修复并跑 TypeScript、Java、integration、OpenSpec、Dashboard、安全扫描和正式 Gate D。
- 人工审批：新的 Gate D 启动、PASS 后 promotion、archive、合并、tag 与 worktree cleanup 均需在证据满足后执行；本轮 release 授权不能覆盖失败门禁。
