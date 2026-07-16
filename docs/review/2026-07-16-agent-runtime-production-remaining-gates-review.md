# Agent Runtime 单机生产剩余门禁进度 Review

## 结论

有风险：2026-07-16 的本地研发回归、类型检查、Java 测试、OpenSpec、Dashboard 与负向扫描全部通过，可以继续保留实现完成度；但正式生产 Gate D、生产资格总门禁、Runtime v1 契约冻结、closeout 与 archive 均缺少对应证据，因此不得宣称生产就绪，也不得把 Dashboard 提升为 `verified`。

## Review 范围

- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [最终实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [开发导航台数据源](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)
- [生产入口](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [生产 Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- [SQLite schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [正式 Gate D runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)

## 主要发现

### Critical

- 无新增 Critical 实现缺陷。
- 正式生产 Gate D 尚未执行。OpenSpec 4.2、4.3 继续保持未完成；此前 24 小时本地数据库/sampler baseline 仅为 `local_verified` 支撑证据，不替代固定混合并发 workload 与 TS Runtime 重启证据。

### Important

- OpenSpec 4.5 把本地测试、安全检查与生产资格门禁组合在同一任务中；本轮只完成前者，因生产资格证据缺失，该任务必须整体保持未完成。
- Dashboard 必须保持 `proposed`。在 Gate D PASS、人工 promotion approval 与生产资格总门禁完成前，不能进入 `verified`。
- Runtime v1 契约冻结、closeout 和 archive 依赖生产证据，OpenSpec 4.6、5.2、5.3、5.4 继续保持未完成。

### 本地验证证据

- `pnpm test`：shared-schema 60/60、agent-runtime 434/434、frontend 24/24、integration 17/17。
- `pnpm typecheck`：shared-schema、agent-runtime、frontend 全部通过。
- `mvn -q -f backend/pom.xml test`：Surefire 汇总 tests=208、failures=0、errors=0、skipped=0。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：通过。
- `npx openspec validate --all --strict --no-interactive`：23/23 通过。
- `pnpm dashboard:check` 与 `git diff --check`：通过。

### 负向扫描证据

- 生产源码和 Provider evidence 未发现高风险 API key、Bearer token 或固定 qualification canary；固定 canary 仅命中指定 Java 测试源。
- 生产入口强制 `AGENT_RUNTIME_PROFILE=production`、绝对 SQLite 路径和 service token，并通过 production Runtime context 绕过开发态 JSON history factory；未发现生产 JSON dual-write。
- SQLite schema 与 repository 查询使用 `tenant_id + user_id + conversation_id` 作用域，未发现 bare conversation key。
- `preview_delta` 仅存在于共享瞬态协议定义，未进入 SQLite durable event 写入路径。
- outbox 对 `pending` / `retry` / `dead_letter` 只做可审计状态迁移，未发现 pruning/delete 路径。
- 固定 Gate D 约束仍为 24 小时、30 秒采样、10,000 会话、20 并发、60/20/15/5 workload，以及第 2/12/22 小时重启；未发现阈值漂移。

#### 可复现命令与观测结果

完整、可复制的唯一命令为：

```bash
bash docs/verification/agent-runtime-v1/task14-negative-scans.sh
```

命令实现已落盘到 [Task 14 negative scans](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/task14-negative-scans.sh)。该脚本包含完整 `rg` 参数和两个完整 Node 断言程序，并机械要求：

- secret/API key/Bearer 高风险形态在生产源码与 Provider evidence 中零命中；
- 固定 qualification canary 在生产源码与 evidence 中零命中，且测试命中只能位于三个指定 Java qualification test；
- 默认生产身份、bare conversation key、preview durability、outbox pruning 均零命中；
- production entrypoint/server 必须通过 SQLite production context wiring；
- 24h、30s、2/12/22h、10,000、20 与 60/20/15/5 固定 Gate D 约束必须全部存在。

本轮执行 exit code 为 `0`，完整汇总输出为：

```text
secret_shape=pass:no-match
qualification_canary_production=pass:no-match
qualification_canary_test_scope=pass
default_identity=pass:no-match
bare_conversation_key=pass:no-match
preview_durability=pass:no-match
outbox_pruning=pass:no-match
production_sqlite_context=pass
fixed_gate_d_constraints=pass
task14_negative_scans=pass
```

## 最终建议

1. 将本轮视为 Task 14 的本地研发验证与证据对齐完成，不重复此前 24 小时本地 baseline。
2. 下一生产动作只能是：获得新的 Gate D 启动审批，完成 production preflight，然后运行正式固定 workload；失败时保留 immutable partial report 且不自动重试。
3. Gate D PASS 后仍需独立核验结果并取得人工 promotion approval，之后才能执行生产资格总门禁、冻结 Runtime v1 契约、生成 closeout、同步 Dashboard `verified` 并申请 archive。

## 后续门禁

- OpenSpec proposal：无需新建；继续执行已批准的 `harden-agent-runtime-single-node-production` change。
- Superpowers plan：无需新建；继续使用现有最终实施计划。
- 测试：本地正式回归已通过；仍需正式生产 Gate D 与其后生产资格验证。
- 人工审批：正式 Gate D 启动、Gate D 结果 promotion、最终 archive 均不得从本轮“继续推进”推定授权。
