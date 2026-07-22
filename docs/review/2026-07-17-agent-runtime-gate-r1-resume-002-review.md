# Agent Runtime Gate R1 Resume-002 Pre-run BLOCKED Review

## 结论

需修改 / **BLOCKED**：Task 6 `resume-002` 在第一个 `full-oracle` 启动前被唯一获准的 `pre-run-clean` observer 阻断。该工具结果为 numeric exit `41`，唯一 stdout 为 `observer=pre-run-clean runId=gate-r1-full-002 role=blocked pid=0 ppid=0`；执行器按计划没有重试、检查或启动 run。因此这是 **execution protocol / host-cleanliness blocker**，不是 Gate R1 performance result；没有 admission、replay、oracle、workload、Runtime 或 MCP 性能结论。

历史 blocker 的具体根因 **unresolved**。observer 实现会把“发现任一匹配进程”和“process snapshot / observer sampling 失败”等不同内部状态统一折叠成同一 exit `41` 与 `role=blocked`，且有意不返回分类。现存结果无法证明当时是 stale/并发进程、受限主机权限、采样故障或其他匹配，也不能用清理后的当前状态倒推历史时点。当前计划明确禁止自动 retry 或第三次 resume；任何进一步动作都需要新的用户决策。

本 Review 未启动 Java、profile、run 或 analyze，未 claim fresh run targets，未修改计划、Preflight、源码、测试、OpenSpec、Dashboard、package、lockfile、历史 evidence 或项目规则。唯一写入是本 Review。

## Review 范围

- 工作树：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，独立 SHA-256 `6d3025c635901ac6f680c1d971edc6384ba7f4b3933b5d66c709df83807d85aa`
- Strict Preflight：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，独立 SHA-256 `32690cfb304ed652908e51ccdee50078e5e905205c8aca3fcc2f01a7eb2613c5`
- Attempt-001 BLOCKED Review：[2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md)
- Resume-001 BLOCKED Review：[2026-07-17-agent-runtime-gate-r1-resume-001-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-001-review.md)，当前 SHA-256 `d6a503a477d7a316ee0cd00a9a4c3ee0772f20219d0420a8ddd20204899b0ec8`
- Gate R1 evidence directory：[gate-r1](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- Resume-002 Java log：[java-gateway-18084-resume-002.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-002.log)
- Resume-002 Java PID record：[java-gateway-18084-resume-002.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-002.pid)
- Java credential boundary：[AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- 预定但未生成的 diagnosis Review：[2026-07-17-agent-runtime-gate-r1-diagnosis-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

### 受保护输入边界

[attempt-002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 只执行 no-follow `stat`。Reviewer 未 hash、打开、查询、复制、移动、读取或写入其内容，也未创建或触碰 sidecars。当前 fixed tuple 为 `16777232:165257457:1835978752:1784167299:1784167299`，与计划一致；`-wal` 与 `-shm` 均 absent。

## Attempt-001 / Resume-001 / Resume-002 区分

- **Attempt-001**：immutable offline profile 已形成；首个 run wrapper 因 host regex portability 问题 exit `97`，发生在 CLI、Runtime 与 workload 之前。三个 performance variants 未开始。
- **Resume-001**：`full-001` 曾启动，但控制面 observer 协议/竞态导致 active run 被停止；留下 consumed partial database、zero-byte report 与 singleton lock。纠正后的 observer 只证明更晚时点存在 coherent chain，不能追溯形成 performance result。
- **Resume-002**：prestate、nonprinting credential selfcheck 与 fresh Java owner/readiness 已完成；第一个 `pre-run-clean` 在 run 启动前 exit `41`。`gate-r1-full-002` 从未启动，十个 run/lock/decision targets全部 absent。

三次边界均不提供可比较的三 variant 报告；不得把 profile、partial full-001、Java readiness 或 observer cleanup 推导为 admission 根因。

## 主要发现

### High — `role=blocked` 有意抑制内部类别，历史根因不可证明

计划中 observer 的真实 mechanics 是：

1. `observer_sample` 先调用 `LC_ALL=C ps -Ao pid=,ppid=,command=` 获取一次 process-table snapshot；失败返回内部 `45`。
2. AWK 以拆分字符串组装 diagnostic CLI、Runtime child 与 qualification MCP fingerprints。`pre-run-clean` / `post-run-no-orphan` 对任何匹配设置 `any_task6` 并 exit `42`；只有完全无匹配才输出 `role=none` 并 exit `0`。
3. `pre-run-clean` wrapper 对所有非零 `sample_status` 都调用 `blocked_result`，只输出 `role=blocked pid=0 ppid=0` 并 exit `41`。内部 `42` 与 `45` 不出现在最终结果；匹配的角色、PID、PPID和命令也不返回。
4. 因而历史 exact exit `41` 只证明 observer 未获得 clean verdict；它不能区分 process-present 与 snapshot/sampling failure，更不能区分 CLI、Runtime、MCP或并发主机活动。

静态字符串拆分以及当前清理后 sanitized classifier 没有发现 observer 自身匹配；此前 Preflight 的 clean-host/synthetic 结果也与“不自匹配”一致。但这只降低 self-match 假设，不证明历史时点。Reviewer 当前普通 sandbox 中对同一 observer body 的一次只读、非权威探针返回 exit `41`；随后普通 classifier 明确遭遇 `ps` permission denial，而获准的 sanitized classifier exit `0` 且返回零匹配行。这证明 process data source 会受执行权限上下文影响，但不能证明历史 observer 的 `41` 就由该原因造成。

结论必须保持 `unresolved`，不能把最可能解释写成事实。

### High — Run 从未启动，Gate R1 没有 performance evidence

执行交接记录：initial prestate exit `0`，初始 available disk `173863596 KiB`，八份历史 evidence 精确匹配，十二个 resume-002 targets fresh；credential selfcheck exit `0` 且不打印值；Java binding exit `0`。第一个 full pre-run disk/Java/fresh gate exit `0`，available disk `173860872 KiB`。随后唯一 pre-run observer exit `41`，执行器没有 retry 或追加历史时点检查，run 命令从未提交。

独立 current-state no-follow checks确认以下十个 run/lock/decision targets全部 absent：full-002 database/report/lock、workload-001 database/report/lock、incremental-001 database/report/lock与decision。analyze、diagnosis Review与final evidence audit均未执行。当前 Review 时 available disk `173814404 KiB` 仅是清理后的非权威当前值，不能代替历史 pre-run 值。

因此本轮没有 report、sample、probe timing、variant comparison 或 decision；`BLOCKED` 只能归类为执行协议/主机洁净度门禁失败。

### Pass — Immutable history与resume-002 Java evidence边界可机械验证

八份历史 evidence 仍为 non-symlink mode `0600`，size/SHA与计划逐一精确匹配：profile `10126` / `bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541`；original Java log `4527` / `18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02`；original PID `6` / `db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089`；resume-001 Java log `99731235` / `5e103d31edf342e6ec0f6121141517a0c0196cbbe6c644985dda16351216c52f`；resume-001 PID `6` / `4667fcf59d1f03c1db90f299b115525df71eb7da8d3cc46211e6a18fa8f5f1c7`；partial full-001 database `240963584` / `cc90a03bbb4887b7b2705768fe3ef357e7b1c8889d9f7564d02c32abb596714f`；zero-byte full-001 report 与 lock 均为 empty-file SHA `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。

Resume-002 Java log为 non-symlink mode `0600`、size `4527`、SHA-256 `311460c74635cc30a938b5f9d5a37b8018748c7e10a44f13da8aa598bc134c82`；PID record为 non-symlink mode `0600`、size `6`、SHA-256 `26769b0d0c1b476354ee6439b92c84a21c89bec06418a20fa8fa0663bd172393`。日志有一个 application-ready marker、无 reviewed startup failure marker；PID record是单行纯数字。

### Pass — Owned cleanup完成，当前host无Task 6残留

执行交接记录 owned Java cleanup exit `0`。独立 current-state checks确认该PID已退出、port `18084` free；获准的 sanitized process classifier对Gate R1 diagnostic CLI、Runtime child与qualification MCP返回零匹配行。该 current-state证据仅证明清理后的状态，不证明 observer 执行的历史时点为何 blocked。

## 最终建议

保持 Task 6 / Gate R1 `BLOCKED`，不实施性能修复，不选择任何 admission 根因。供用户作新的显式决策的选项只有：

1. **停止并保留现状**：把 Task 6 记录为 execution-protocol blocked，推迟 Gate R1 diagnosis；现有历史与resume-002 Java evidence全部原样保留。
2. **单独授权新的诊断协议修订**：先修订计划，为 pre-run observer增加仍然 sanitized、但可区分 host snapshot failure 与 process-present 的最小 reason code，并把全局 Runtime/MCP cleanliness范围、工具权限和新one-shot target basenames写成确定合同；随后重新 independent strict Preflight。不得在本 Review 中实现该选项。
3. **显式授权新的执行尝试**：只有用户另行决定后，才能在新revision中定义是否允许新的resume、全新Java evidence basenames、fresh-target合同及observer权限。当前 revision 的 “no third resume” 仍有效，不能把本 Review或清理后探针当成授权。

任何选项都不得复用、补写、删除、截断、重命名或覆盖已消费 evidence，也不得从 partial full-001 推断趋势。

## 后续门禁

- Task 6 / Gate R1：`BLOCKED`；不是 performance PASS/FAIL/confirmed/inconclusive result。
- OpenSpec：本 Review不需要新proposal，也未修改现有 active [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)；active change继续未归档。若后续改变threshold、workload、持久化、部署或用户可见合同，必须重新作OpenSpec决定。
- Superpowers：当前计划不授权retry或第三次resume。后续若用户选择新协议/尝试，必须先形成新revision并通过independent strict Preflight；在此之前不得启动Java/profile/run/analyze或claim target。
- Git/发布：正式Gate D、performance repair、Git add/commit/push、OpenSpec archive、Dashboard state transition、main merge、tag、evidence/worktree cleanup全部禁止。
- 项目规则：未修改。

## 验证记录

- Nonprinting generic-pattern与actual reviewed credential scan：exit `0`，共扫描10份text/JSON/PID/Review targets；未输出凭据值。
- 受保护attempt-002 SQLite与所有SQLite database内容均未进入本Review的sensitive-data scan。
- `git diff --check`：exit `0`。
