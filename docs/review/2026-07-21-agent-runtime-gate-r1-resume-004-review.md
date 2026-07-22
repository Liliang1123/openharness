# Agent Runtime Gate R1 Resume-004 Execution BLOCKED Review

## 结论

需修改 / **BLOCKED**：Task 6 `resume-004` 已通过 exact Step 1、nonprinting credential prerequisite、固定 Maven binding、Java owner/readiness 与 full-002 per-run resource gate，但在 `gate-r1-full-002 / full-oracle` 启动前的第一次且唯一一次 `pre-run-clean` observer stage fail closed。该 observer 返回 initial `immediate-numeric`、retained `no`、poll count `0`、final numeric exit `45`，complete stdout 精确为 `observer=pre-run-clean runId=gate-r1-full-002 reason=snapshot-failure role=none pid=0 ppid=0`。结构 verdict 为 `BLOCKED`。

失败发生在 diagnostic run、active observer、Runtime child、MCP child、workload、sample、report、validator 与 analyze 之前。执行链没有启动第二个 observer exec/shell，没有 retry、fallback、异步修正、外部协调或第五次 resume；没有启动 full-002 run、workload-001、incremental-001 或 analyze。因此本轮只有 host process-table snapshot acquisition 的执行门禁结论，没有 Gate R1 performance result，也没有 admission、replay、database oracle、session growth 或 outbox primary-cause 结论。

本轮新增并保留的 fresh evidence 只有 resume-004 Java log/PID 两份。Java 已由原 retained PTY owner发送 Ctrl-C，随后 owner-bounded cleanup 证明端口 `18084` 无 listener、Runtime orphan `0`、MCP orphan `0`。十份 run database/report/lock/decision targets均保持 absent/no-follow。受保护 attempt-002 主 SQLite pre/post 只执行固定 `stat`，tuple 未变化，WAL/SHM 均 absent。

本 Review 不记录自身 SHA-256。文件完全 finalise并通过 failure-only 扫描后，其 SHA-256 只能由外部 tool result捕获，禁止回写。

## Review 范围

- 项目工作树：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 项目规则：[worktree AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)
- OpenSpec 规则：[openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- Resume-004 executable plan：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `707fb83ee81e7faed394fc11afeeedf7f0c4f8c18c9de2747a7f963eaabe7fc1`
- Fresh independent Preflight：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，SHA-256 `77c398c215b67d85f9f45ad3e2c9b836fdffb13fac4541e07a75d368a8d01e25`，顶部 Preflight-002 `PASS`
- Resume-003 execution Review：[2026-07-21-agent-runtime-gate-r1-resume-003-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-review.md)，SHA-256 `0186e3280832ef5ccb5addef762830bdd809c8b297d4cb4b960798daae120b0b`
- Resume-003 independent Review：[2026-07-21-agent-runtime-gate-r1-resume-003-independent-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-independent-review.md)，SHA-256 `954e2505601d903b04fc9151d14a937b07ff5d136555c456c61171b0759ba653`
- Active OpenSpec proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- Active OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- Active OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Gate R1 evidence directory：[gate-r1](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- Existing immutable profile：[attempt-002-profile.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)
- Protected input：[attempt-002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)，仅固定 no-follow/type/`stat`
- Credential declaration：[AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)，仅 nonprinting selfcheck/extraction
- Maven binding：[launcher](file:///opt/homebrew/bin/mvn) 与 [real target](file:///opt/homebrew/Cellar/maven/3.9.16/bin/mvn)
- Resume-004 Java evidence：[log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-004.log) 与 [PID record](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-004.pid)
- Success diagnosis Review target：[2026-07-17-agent-runtime-gate-r1-diagnosis-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)，保持 absent/no-follow

## Attempt-001 / Resume-001 / Resume-002 / Resume-003 / Resume-004 边界

- **Attempt-001**：immutable offline profile 已形成；original wrapper exit `97`，发生在 diagnostic CLI、Runtime 与 workload 之前。没有三-variant performance result。
- **Resume-001**：partial full-001 database、zero-byte report与singleton lock已 consumed；observer protocol/race `BLOCKED`。不得打开 partial database推断趋势或重建report。
- **Resume-002**：prestate、credential selfcheck与Java lifecycle成功；第一个 pre-run observer exit `41`，任何 run都未开始。full-002/workload-001/incremental-001 database/report/lock与decision保持fresh。
- **Resume-003**：prestate与credential prerequisite成功；Java start在Maven解析前exit `127`，只消费31-byte Java log，PID保持 absent/no-follow，任何run都未开始。
- **Resume-004**：由用户以plan SHA `707fb83e…fc1`和Preflight SHA `77c398c2…e25`明确授权。Maven与Java lifecycle成功，但full-002的唯一pre observer exit `45`；所有run/analyze都未开始。历史Java/observer或partial full-001均不能提供performance inference。

## 主要发现

### Blocking — Full-002 pre-run observer snapshot acquisition fail closed

- Authorized matrix row：`pre-run-clean / gate-r1-full-002`。
- Control-plane metadata：filesystem `unrestricted` / `danger-full-access`，approval policy `never`。
- 唯一shell-start envelope：一个 `exec_command`，fixed `yield_time_ms=10000`，`sandbox_permissions` omitted，`justification` omitted。
- Initial result form：`immediate-numeric`；retained session：`no`；poll count：`0`；final numeric exit：`45`。
- Sanitized complete stdout：`observer=pre-run-clean runId=gate-r1-full-002 reason=snapshot-failure role=none pid=0 ppid=0`。
- Exit/reason/role structural verdict：`BLOCKED`，与计划对exit `45`的fixed snapshot-failure合同一致。
- 未记录numeric session identifier、命令、environment、path、process snapshot、intermediate sample或secret。未启动第二个observer exec/shell、retry、fallback或correction。
- 该门禁发生在run shell提交前，因此没有Runtime/MCP/workload/sample可供分析。

### Pass — Exact prestate、Maven、credential、Java 与 resource prerequisites

- Plan/Preflight/two resume-003 Review SHA复核exit `0`，全部与批准binding一致。
- Exact Step 1 numeric exit `0`：historical `11`、fresh `12`、success evidence `23`、scan `24`、valid JSON `5`合同一致；resume-003 PID absent/no-follow；两份互斥Review在执行前均fresh。
- Maven launcher为exact symlink，readlink为 `../Cellar/maven/3.9.16/bin/mvn`；real target为non-symlink regular executable；两个dereferenced SHA均为 `840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1`；version为Maven `3.9.16` revision `2bdd9fddda4b155ebf8000e807eb73fd829a51d5`；Java context为`26.0.1`。
- 未运行Homebrew、install、upgrade、relink、wrapper、bare Maven、PATH fallback或repair。
- Credential prerequisite numeric exit `0`、stdout `0` bytes；未输出值、长度或source line。三个run wrapper均未执行。
- Initial disk gate `available_kib=140064532`；full-002 per-run gate `available_kib=140050036`；均高于fixed `12582912 KiB`。未删除、截断、压缩、移动或清理evidence以获得空间。
- Java fresh log/PID均为non-symlink regular mode `0600`；health、唯一listener、PID file与main-class/port fingerprint binding通过。唯一owner PID为`30164`，仅resume-004 PID evidence与retained Java PTY赋予ownership。

### Pass — Owned cleanup 与 protected input poststate

- Observer `BLOCKED` 后，原retained Java PTY收到Ctrl-C并以numeric exit `1`结束；该exit是受控终止结果，不是Java startup或health failure。
- Fresh-shell owner-bounded cleanup numeric exit `0`：`port=18084 listener=none runtime_orphans=0 mcp_orphans=0`。未signal ports `8080`/`18080`、historical PID、unobserved process或changed fingerprint。
- Protected main pre tuple与post tuple均为 `16777232:165257457:1835978752:1784167299:1784167299`；pre/post WAL/SHM均 absent。
- Protected main仅执行no-follow/type与fixed `stat`；未hash、open、query、copy、move、rename、chmod、write或读取content，未创建或触碰sidecar。
- Existing immutable profile机械事实保持：`databaseBytes=1835978752`、`tableRows.runtime_events=2671288`、`eventDeliveryStatus.pending=2671288`、non-pending delivery counts全零、其余四表仅按nonnegative integer处理、query plans exact `15`。

### Not reached — Runs、remaining observers、validators、analyze与success audit

- Full-002 run、active observer、post observer与validator：not run。
- Workload-001 pre/active/post observers、run与validator：not run。
- Incremental-001 pre/active/post observers、run与validator：not run。
- Analyze/decision：not run；不存在diagnosis decision。
- Success diagnosis Review与success-only `23 evidence / 24 scan / 5 JSON` audit：not run。Failure path不得伪造或缩减该success audit。
- Gate R1 result不是`confirmed`或`inconclusive`，不得启动performance repair或选择“最可能”的fix。

## Resume-004 fresh target实际状态

| Target | State |
|---|---|
| [java-gateway-18084-resume-004.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-004.log) | present / consumed / mode `0600` |
| [java-gateway-18084-resume-004.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-004.pid) | present / consumed / mode `0600` |
| [gate-r1-full-002.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-002.sqlite) | absent/no-follow |
| [gate-r1-full-002-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-002-report.json) | absent/no-follow |
| [gate-r1-full-002.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-002.sqlite.lock) | absent/no-follow |
| [gate-r1-workload-001.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-workload-001.sqlite) | absent/no-follow |
| [gate-r1-workload-001-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-workload-001-report.json) | absent/no-follow |
| [gate-r1-workload-001.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-workload-001.sqlite.lock) | absent/no-follow |
| [gate-r1-incremental-001.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-incremental-001.sqlite) | absent/no-follow |
| [gate-r1-incremental-001-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-incremental-001-report.json) | absent/no-follow |
| [gate-r1-incremental-001.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-incremental-001.sqlite.lock) | absent/no-follow |
| [gate-r1-decision.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-decision.json) | absent/no-follow |

[Resume-003 PID target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-003.pid) 继续 absent/no-follow，不计入evidence。[Success diagnosis Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md) 保持 absent/no-follow；本 contingent BLOCKED Review为唯一Review outcome。

## Present evidence mode / size / SHA-256

以下十三份实际 evidence均为non-symlink regular file、mode `0600`。前十一份保持immutable binding；后两份为本轮新增且必须保留的consumed evidence。

| Evidence | Size | SHA-256 |
|---|---:|---|
| [attempt-002-profile.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json) | 10126 | `bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541` |
| [java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.log) | 4527 | `18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02` |
| [java-gateway-18084.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.pid) | 6 | `db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089` |
| [java-gateway-18084-resume-001.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-001.log) | 99731235 | `5e103d31edf342e6ec0f6121141517a0c0196cbbe6c644985dda16351216c52f` |
| [java-gateway-18084-resume-001.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-001.pid) | 6 | `4667fcf59d1f03c1db90f299b115525df71eb7da8d3cc46211e6a18fa8f5f1c7` |
| [gate-r1-full-001.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite) | 240963584 | `cc90a03bbb4887b7b2705768fe3ef357e7b1c8889d9f7564d02c32abb596714f` |
| [gate-r1-full-001-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001-report.json) | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| [gate-r1-full-001.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite.lock) | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| [java-gateway-18084-resume-002.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-002.log) | 4527 | `311460c74635cc30a938b5f9d5a37b8018748c7e10a44f13da8aa598bc134c82` |
| [java-gateway-18084-resume-002.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-002.pid) | 6 | `26769b0d0c1b476354ee6439b92c84a21c89bec06418a20fa8fa0663bd172393` |
| [java-gateway-18084-resume-003.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-003.log) | 31 | `4707abc6949e53eb9225dc8181e2be5e3c6201ad35d9c33cab43bb627992dfd7` |
| [java-gateway-18084-resume-004.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-004.log) | 3895 | `4cd818b910a0834111aaf79dd4c5964b9521900d74bc6ebe4e1e002c8aeb8e3e` |
| [java-gateway-18084-resume-004.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-004.pid) | 6 | `487dbdf97d025649e178a6102e520ea014b1f142cfc1ca150595a77fdf95fbb9` |

## 验证记录

| Stage | Numeric outcome | Result |
|---|---:|---|
| Plan/Preflight/resume-003 SHA recheck | `0` | fixed bindings match |
| Exact Step 1 | `0` | protected tuple、Maven、historical/fresh counts、disk与port checks pass |
| Credential prerequisite | `0` | stdout `0` bytes |
| Java start/readiness | running then readiness `0` | exact owner/listener/health binding pass |
| Full-002 per-run resource gate | `0` | disk、Java identity与three full targets fresh |
| Full-002 pre observer | `45` | fixed snapshot-failure row；`BLOCKED` |
| Java PTY controlled termination | `1` | Ctrl-C completed；not a startup failure |
| Owner-bounded cleanup | `0` | port/listener/orphan checks pass |
| Protected post-stat | `0` | fixed tuple and sidecar absence unchanged |
| Full/workload/incremental runs与validators | not run | stopped before first run |
| Analyze/decision | not run | no reports exist |
| Success-only final audit | not run | forbidden on failure path |

一项pre-shell orchestration composition error曾发生在首次exact Step 1 shell提交之前；它没有启动`exec_command` shell、没有执行项目命令、没有claim或修改artifact。随后exact Step 1 shell本身只启动一次并exit `0`。该零副作用control-plane包装错误不用于补足任何门禁；最终`BLOCKED`仍由唯一实际observer的numeric exit `45`独立成立。

## 最终建议

保持 Task 6 / Gate R1 `BLOCKED` 并原样保全十三份present evidence。不要重试observer、启动任何run、创建diagnosis decision、选择或实现performance repair，也不要发起第五次resume。当前observer只证明host snapshot acquisition失败；不能把它解释为Java、Runtime、MCP、workload或database-oracle failure。

恢复条件需要新的用户决定；当前计划明确禁止fallback、新runId/basename、缩短duration、改变workload/threshold、替换observer或clean evidence。任何进一步执行都超出本resume-004授权。

## 后续门禁

- Task 6 / Gate R1：`BLOCKED`；没有performance decision。
- OpenSpec：无需新增或修改；active [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/) 保持未归档。本Review不授权archive。
- Superpowers：现有resume-004链已消费并停止；不得创建或执行repair plan，不得进行第五次resume。
- Formal Gate D：未执行且仍被禁止；本地observer blocker不能构成Gate D证据。
- Git/发布：未执行且不授权Git add/commit/push、merge、tag或publication。
- Dashboard：未修改，不触发同步。
- Evidence/worktree：未清理、删除、覆盖、重命名、复用或修复任何existing/consumed evidence；不授权cleanup。
- 项目规则：未修改。
