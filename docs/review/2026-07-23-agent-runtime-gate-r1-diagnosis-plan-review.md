# Agent Runtime Gate R1 诊断恢复计划 Review

## 结论

通过：计划 SHA-256 为 `8b3ceab79249497af9b01f44dc15ca888c98e621d74c285a733102d2388065aa`。当前 revision 将本轮诊断限制在已批准 active OpenSpec change 内，保留正式 Gate D 的固定 workload、阈值和人工 promotion 门禁，并为三个 30 分钟变体分配了全新、互不覆盖的 evidence binding。可以进入执行。

## Review 范围

- [Gate R1 诊断恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-23-agent-runtime-gate-r1-diagnosis-resume.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Gate D 性能失败恢复最终计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-16-agent-runtime-gate-d-recovery-final-plan.md)
- [Gate D diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Gate D diagnostic execution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [工程不变量](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/engineering-invariants.md)

## 主要发现

### Critical

无。

### Important

- 计划没有复用历史 Gate D / Gate R1 SQLite、report 或 runId；新 evidence 目录、三个数据库、三个 report 和 decision 均为一次性 no-overwrite target。
- 三个变体保持相同 10,000 conversations、20 concurrency、60/20/15/5 workload、30 秒采样与 60 samples，只改变 database oracle 变量，满足单变量根因判定要求。
- credential 仅从现有 Java `AuthFilter` declaration 提取到子 shell 环境，不出现在 argv、计划产物或日志；MCP fixture config 不包含 credential。
- Java Gateway 使用唯一 loopback 端口和受控 PTY，三个变体严格串行；失败时不得自动换名、覆盖或进入下一变体。
- analyzer 只能输出 local diagnosis，不能把 30 分钟诊断冒充正式 Gate D PASS。

### Minor / 非阻塞风险

- 三轮预计生成数 GiB 本地 SQLite；计划已设置 24GiB 初始和 12GiB 逐轮磁盘门禁，当前可用空间满足要求。
- 诊断 CLI 在运行期间只在结束时写 final report；执行控制面必须持续保留同一 session，并按固定间隔检查 Java 与子进程状态，不能因暂时无 stdout 判定失败。
- 本轮 evidence 可能保持未跟踪；在诊断 Review 和后续修复收口前不得删除、暂存或移动。

## 验证记录

- 计划中的 7 个 `bash` fenced blocks 同时通过 `bash -n` 与 `zsh -n`。
- `git diff --check` 通过。
- 固定 workload、100ms / 250ms 阈值、OpenSpec / Dashboard / archive / promotion 边界静态扫描通过。
- 执行前最新基线已经通过：TypeScript 716 tests、Java 208 tests、typecheck、OpenSpec strict validation 23/23、Dashboard check。

## 最终建议

按计划依次执行：

1. 创建 mode `0700` 的新 evidence 目录及 mode `0600` MCP config；
2. 运行 fail-closed preflight；
3. 启动唯一 Java Gateway；
4. 串行完成 full、workload、incremental 三个变体；
5. 生成 analyzer decision 和独立诊断 Review；
6. 依据 confirmed root cause 创建下一份具体 TDD 修复计划。

若任一变体产生非零退出、少于 60 samples、hard failure、进程归属异常或 evidence mismatch，结论必须保持 `BLOCKED`，不得通过重用文件或降低门槛继续。

## 后续门禁

- **OpenSpec proposal：** 当前不需要新增。只有修复需要改变 API、retention、outbox lifecycle、正式 workload、阈值或持久化语义时才新建 proposal。
- **Superpowers plan：** 本计划已可执行；根因确认后仍需创建并 Review 一份具体 TDD 修复计划。
- **测试：** 三变量诊断后必须完成 RED/GREEN、focused/full tests、60 分钟 local regression 和正式 24 小时 Gate D。
- **人工审批：** 用户已授权持续推进本地诊断与开发；正式结果后的 production promotion 仍须基于实际 Gate D evidence 判定，不能提前视为通过。
- **Dashboard：** 当前未触发 `proposed`、`verified` 或 `archived` 同步点，不修改 Dashboard。
- **项目规则：** 未修改。
