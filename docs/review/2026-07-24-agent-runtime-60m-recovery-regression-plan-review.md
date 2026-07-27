# Agent Runtime 固定 60 分钟恢复回归执行前 Review

## 结论

**通过。** 本计划和证据执行器可进入真实 Java Gateway preflight；未发现 Critical 或 Important 未关闭项。通过仅授权本次固定 60 分钟本地恢复回归，不授权正式 24 小时 Gate D、OpenSpec task 勾选、archive 或 production promotion。

## Review 范围

- [60 分钟恢复回归执行计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression.md)
- [60 分钟恢复回归执行器](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/run-60m-recovery-regression.ts)
- [本轮 MCP 配置](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/mcp-config.json)
- [性能恢复实现 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-performance-recovery-implementation-review.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [正式 soak execution primitives](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)
- [本地 baseline thresholds](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/localBaseline.ts)

冻结 SHA-256：

- plan：`78308c2906afd814764c85bea6d3fbc94b710a44d61d2ef06f11b1532bf44aec`
- runner：`cb97b09a2232b1ad03a76895f235f1761f169ed34a0b93ce95ef7c81a396571d`
- MCP config：`6a07a63facb8078d8f85ffdb8364a0d8e0f0334743dbe2fe8de8ecc9670a51f6`

## 主要发现

### Critical

无。

### Important

无。

### 已满足的准入条件

1. **边界没有扩大：** 计划明确绑定现有 OpenSpec change，结果最高只能是 `local_verified`；不伪装为正式 24 小时 Gate D，也不执行 restart schedule 或 promotion。
2. **工作负载固定：** 执行器硬编码 3,600,000 ms、30,000 ms、120 samples、10,000 scopes、concurrency 20，并直接复用既有 deterministic 60/20/15/5 workload。
3. **真实生产链路：** Runtime child 由 production spawn spec 启动，使用真实 Java URL、新 SQLite、真实 stdio MCP fixture、authenticated readiness 与正式 `formal-incremental` database oracle。
4. **证据不可覆盖：** SQLite 使用 `wx+` 和 `0600` 抢占身份；journal/report 使用现有 no-overwrite writer；已存在输出在参数解析阶段即阻断。
5. **身份与源码绑定：** SQLite `dev/ino` 传入 Runtime；source、runner、plan、MCP config 在开始和结束计算 SHA-256，变化形成硬失败。
6. **凭据边界：** service token 只从环境读取，不进入 CLI 参数、journal 或 report；Runtime child output 使用既有 redaction；report 写入前再次检查 exact token。
7. **失败关闭与清理：** dead-letter、readiness、Java、Runtime、隔离、oracle 和证据绑定失败会终止采样；`finally` 等待 workload、Runtime 和 MCP lifecycle 收口。
8. **观察器无新增全表聚合：** 每样本一致性使用 `formal-incremental`；额外数据库状态只读 rowid 高水位及 trace partial-index backlog/dead-letter，不恢复已否决的全量 duplicate/group-by oracle。
9. **固定阈值：** 复用 admission、replay、RSS、FD、WAL 的现有阈值，并把本轮 MCP child count 固定为一个配置实例；标准阈值使用 5 分钟 sustained 判断。
10. **静态检查：** runner 已通过实际 `tsx` 模块装载；`git diff --check` 通过；MCP config 权限为 `0600`。

### Advisory

1. Java TraceService stdout 的增长仍可能显著；本轮会持续记录 Java log bytes，并在 Java 停止后做脱敏负向扫描。此项不允许在运行中通过降低 workload 或删日志规避。
2. 本轮只有 60 分钟，不能覆盖 OpenSpec 要求的首尾各 2 小时 RSS/FD median growth，也不能替代 24 小时 restart schedule。
3. 既有低磁盘/WAL admission contract wiring 仍需单独复核；本轮只观察 WAL 与可用空间，不以本次 PASS 推断该 contract 已闭合。

## 最终建议

按计划先启动唯一 Java Gateway，再执行 runner 的 `--validate-only`。只有 Java/MCP probes、端口、权限、fresh paths 和四类 SHA binding 全部通过，才能用完全相同参数启动正式 60 分钟回归。运行期间不得修改冻结输入；失败后保留原证据，未经新计划与 Review 不得复用 runId 重跑。

## 后续门禁

- **OpenSpec proposal：** 当前不需要新 proposal；工作仍在已批准的 `harden-agent-runtime-single-node-production` change 内。
- **Superpowers plan：** 本 Review 通过后，[当前计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression.md) 可执行。
- **测试：** 先完成真实 `--validate-only`，再执行 60 分钟回归；结束后必须进行 report 结构/阈值/证据绑定复核、负向扫描和当前源码全量验证。
- **人工审批：** 本地恢复回归不需要额外人工 promotion 审批；正式 24 小时 Gate D 的启动/结果晋升仍按既有合同执行。
- **归档：** 本轮结束不得归档 OpenSpec change；Gate D、低磁盘/WAL contract 和剩余 final review 均未完成。
