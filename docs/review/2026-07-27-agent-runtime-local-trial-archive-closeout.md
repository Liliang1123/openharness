# Agent Runtime Local Trial Archive Closeout Review

## 结论

通过：`harden-agent-runtime-single-node-production` 已完成用户批准的 `Local Trial Ready` 实现、全量本地验证、Project Learning Closeout 和证据边界收口，可以归档。该结论**不是** `Production Verified`，未执行的正式 24 小时 Gate D Attempt005 保持 `deferred_by_user`，不得标记 PASS。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production/tasks.md)
- [Agent Runtime source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src)
- [Agent Runtime tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test)
- [Java backend source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- [Local Trial readiness decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-local-trial-readiness-decision-review.md)
- [Attempt004b result](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004b-result-review.md)
- [Attempt005 deferred preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-gate-d-attempt-005-preflight-review.md)
- [engineering invariants](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/engineering-invariants.md)
- [learning candidate](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/learning-candidates/2026-07-27-runtime-storage-worker-and-trial-evidence-boundaries.md)
- [development dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/development-log.json)

## 主要发现

- 通过：专用 SQLite Worker 持有生产数据库句柄，主线程通过有界 P0/P1/P2 类型化语义命令访问；协议、背压、崩溃、心跳、reconciliation、outbox 与 shutdown 门禁均有确定性测试。
- 通过：成熟数据库 Attempt004b 完成 20/20 样本，admission p95 中位数 44.723ms、replay p95 中位数 71.492ms，相对冻结基线改善 75.529%，Worker unavailable/queue-full 为零。
- 通过：Fresh workspace 回归为 shared schema 60、Agent Runtime 683、Frontend 24、Integration 17；Java 213 tests；TypeScript typecheck、OpenSpec strict 23/23、Dashboard 和 diff checks 均通过。
- 已修复：全量测试首次运行时，`detachedStream` 的 5 秒等待与一个故意运行约 5 秒的 SQLite contention probe 形成等长调度窗口，产生一次假阴性；独立连续 5 次通过后，将测试等待上限调整为总用例 15 秒预算内的 10 秒，全量回归随后通过，未修改生产语义。
- 边界：Attempt005 只存在静态准备 packet；无 `approval.json`、active `preflight.json`、journal、partial report、final report 或正式 workload。
- 边界：生成型 SQLite/WAL/log 不进入 Git；保留可审计的配置、脚本、JSON/JSONL 报告和 Review。

## Project Learning Closeout

- 已将“生产 SQLite 必须由专用 Worker 持有”提升为项目工程不变量，并由协议/背压/崩溃/心跳测试及负向扫描机械执行。
- 已将“Local Trial evidence 不得晋级 Production state”提升为项目工程不变量，并由 OpenSpec tasks、Dashboard、Attempt packet 与 closeout Review 一致性门禁执行。
- Candidate Card 已标记 `promoted`；没有修改 `AGENTS.md` 或全局项目治理规则。

## 最终建议

1. 归档当前 change，Dashboard 更新为 `archived`，归档摘要继续显示 `Local Trial Ready`。
2. 用户先通过本地 CLI wrapper 试用当前运行时，反馈只转化为小型、可复现的优化 change。
3. 如需 `Production Verified`，创建全新 OpenSpec change、全新 runId 与 packet；不得复用 Attempt005。
4. 如需正式产品 CLI，单独定义安装、升级、命令契约、配置与凭据边界。

## 后续门禁

- OpenSpec：当前 change 归档后无 active change；生产资格和产品级 CLI 均需未来独立 proposal。
- Superpowers：本次归档/合并计划已批准并执行；未来行为变更仍需对应计划和 TDD。
- 测试：本地试用可以开始；不要求本次重复 24 小时 Gate。
- 人工审批：本次归档和 `main` 合并已获用户明确批准；远程 push 未获授权且不执行。
