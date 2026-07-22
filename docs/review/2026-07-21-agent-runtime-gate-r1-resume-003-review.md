# Agent Runtime Gate R1 Resume-003 Java Start BLOCKED Review

## 结论

需修改 / **BLOCKED**：Task 6 `resume-003` 的 exact prestate 与 nonprinting credential selfcheck 均通过，但唯一获准的 fresh Java start 在 shell 调用 Maven 时以 numeric exit `127` 结束，唯一可见错误为 `zsh:15: command not found: mvn`。失败发生在 Maven、Java application、Java readiness、任何 Gate R1 observer、diagnostic CLI、Runtime child、MCP child、workload、sample 或 analyzer 启动之前。因此本轮只有执行环境结论：当前执行 shell 无法解析计划固定的 `mvn` 命令；没有 Gate R1 performance result，也没有 admission、replay、oracle、session growth 或 outbox primary-cause 结论。

执行器遵守 zero-retry / zero-fallback 合同：未安装或查找替代 Maven、未改 PATH、未使用 wrapper、未重启 Java、未改端口、未启动任何 variant，也未 claim PID、run database、report、lock 或 decision target。fresh [resume-003 Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-003.log) 已作为 consumed partial evidence 原样保留；[resume-003 Java PID target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-003.pid) 保持 absent，不能补写。

本轮未修改计划、Preflight、source、tests、OpenSpec、Dashboard、package/lockfile、项目规则或历史 evidence；未执行 profile、正式 Gate D、performance repair、analyze、archive、merge、tag、Git 写入或 evidence/worktree cleanup。除本 Review 外，唯一新建文件是上述 consumed Java log。

## Review 范围

- 工作树：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `7e40326603d7a0a56d33d720cecab5a5125c8ab442f3d16bf930634f86989019`
- Independent strict Preflight：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，SHA-256 `1e8286df82a2a453dc146037182214c0de410201642025cf638b586ce2f48da7`，当前 resume-003 结论 `PASS`
- Attempt-001 BLOCKED Review：[2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md)
- Resume-001 BLOCKED Review：[2026-07-17-agent-runtime-gate-r1-resume-001-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-001-review.md)
- Resume-002 BLOCKED Review：[2026-07-17-agent-runtime-gate-r1-resume-002-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-002-review.md)，计划绑定 SHA-256 `52ca54c43523821351b3a0282a4c53a1802c7b4e345e99debceb58e77b0df88b`
- Gate R1 evidence directory：[gate-r1](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- Consumed resume-003 partial log：[java-gateway-18084-resume-003.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-003.log)
- Protected input：[attempt-002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)，pre/post 均仅执行固定 no-follow `stat`
- 成功态 diagnosis Review target：[2026-07-17-agent-runtime-gate-r1-diagnosis-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)，保持 absent

## Attempt-001 / Resume-001 / Resume-002 / Resume-003 边界

- **Attempt-001**：immutable offline profile 已形成；original run wrapper exit `97`，发生在 diagnostic CLI、Runtime 与 workload 之前。没有三-variant performance result。
- **Resume-001**：partial [full-001 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite)、zero-byte [report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001-report.json) 与 [lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite.lock) 已 consumed；observer protocol/race 为 `BLOCKED`，不得打开 partial database 推断趋势。
- **Resume-002**：prestate、credential selfcheck 与 Java lifecycle 成功；第一个 pre-run observer exit `41`，在任何 run 命令提交前停止。full-002/workload-001/incremental-001 的 database/report/lock 与 decision 当时保持 fresh。
- **Resume-003**：plan/Preflight binding、prestate、credential selfcheck 成功；Java start exact command exit `127`，只 claim fresh Java log，未生成 PID，未到 observer/run 阶段。该结果与前述三次尝试相互独立，也不能提供 performance inference。

## 主要发现

### High — 固定 Java start 命令未到达 Maven/Java lifecycle

- Exact Java start tool result：numeric exit `127`；stdout/stderr 合并输出只有 `zsh:15: command not found: mvn`。
- 计划固定命令未能被 shell 解析，因此没有 still-running PTY session、Maven process、Java application PID 或 `127.0.0.1:18084` listener；readiness/binding block未执行，fresh PID target必须保持 absent。
- 本轮没有尝试补救。安装工具、改 PATH、使用 Maven wrapper、改变 exact command、再次 claim Java basenames或启动第四次 resume都超出当前授权。
- 单一根因证据位于执行环境的 command-resolution boundary；它不是 application build failure、Java health failure、Java/MCP capability failure或 Runtime performance failure。

### Pass — Exact prestate、credential与protected input边界未漂移

- Plan SHA与Preflight SHA分别精确匹配上文绑定；Preflight当前 resume-003 结论为 `PASS`。执行 control plane metadata 为 filesystem `unrestricted` / `danger-full-access`、approval policy `never`，工具调用均省略 `sandbox_permissions` 与 `justification`。
- Step 1 numeric exit `0`：十份 historical bindings全部通过 non-symlink/mode/size/SHA检查；十二份 resume-003 targets与成功态 diagnosis Review在 Java start前均 absent/no-follow；existing profile结构断言通过；port `18084`无listener。
- Initial disk gate：`available_kib=142967632`，高于固定 `12582912 KiB`；没有删除、截断、压缩或移动任何 evidence 来换取空间。由于在首个 Java start停止，三个 per-variant disk gates均未执行。
- Credential selfcheck numeric exit `0`、stdout `0` bytes；未输出值、长度或source line。三个 run wrapper未执行。
- Protected input pre tuple为 `16777232:165257457:1835978752:1784167299:1784167299`，post tuple仍为同一值；两次均只执行 fixed `stat`，`-wal` / `-shm` pre/post均 absent。未 hash、open、query、copy、move、rename、chmod、write或读取其内容。

### Pass with blocking protocol note — 无 owned process 与 orphan，但 exact PID-based cleanup不能成立

- Java start在进程创建前结束，工具未返回 still-running session；fresh PID target absent。因此没有可发送 Ctrl-C 的 Java PTY session，也没有由 PID evidence绑定的 owned Java process。
- 计划的完整 PID-based cleanup block按原文执行并以 numeric exit `101` 在 PID-record prerequisite处停止；这是一项 cleanup-proof mismatch，保持本轮 `BLOCKED`，不得用补写PID或扩大kill范围修复。
- 随后的只读 no-owner observation numeric exit `0`：`port=18084 listener=none runtime_orphans=0 mcp_orphans=0`。它只证明失败后的当前 host 无本轮可清理进程，不把 exact cleanup block的 exit `101`改写成 PASS。
- 未发出任何 signal，也未检查或触碰 ports `8080` / `18080`、historical PID owners或其他命令指纹。

### Not reached — 九个 observer、三个 runs、validators、analyze与成功态 final audit

- 九个 future one-shot observer calls全部 **未调用**；没有 pre/active/post result、numeric exit、reason/role row或observer retry。相应 nine envelopes仍只是计划授权，未被执行消费。
- [full-002 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-002.sqlite)、[report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-002-report.json)、[lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-002.sqlite.lock)、[workload database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-workload-001.sqlite)、[report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-workload-001-report.json)、[lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-workload-001.sqlite.lock)、[incremental database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-incremental-001.sqlite)、[report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-incremental-001-report.json)、[lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-incremental-001.sqlite.lock) 与 [decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-decision.json) 均保持 absent/fresh。
- 因没有任何 report或decision，success-only `22 evidence / 23 scan / 5 JSON` audit不能执行；伪造或缩减该audit会违反计划。执行态实际 evidence是十份historical绑定加一份consumed resume-003 partial log。

## Evidence mode / size / SHA-256

以下十一份实际 evidence均为 non-symlink regular file、mode `0600`：

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

本 Review不记录自身 SHA-256。它完成且通过独立scan后，SHA只能由外部tool result捕获，禁止回写。

## 最终建议

保持 Task 6 / Gate R1 `BLOCKED`，不要选择或实现任何性能修复。当前计划明确禁止 automatic retry、第四次 resume或新basename/runId；恢复条件必须由用户重新决定，至少需要一个能够执行固定 Maven命令的受控环境以及新的计划/Preflight授权。不得把替代命令、手工启动Java或复用本轮partial log当作恢复。

如果用户未来授权新尝试，必须先形成新的 executable revision并通过 fresh independent strict Preflight，重新定义新的一次性 Java evidence basenames、fresh target合同、command-availability precondition与cleanup proof；本 Review不创建该revision，也不推定其OpenSpec结论。

## 后续门禁

- Task 6 / Gate R1：`BLOCKED`；不是 performance PASS、FAIL、confirmed或inconclusive。
- OpenSpec：未修改；active [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/) 继续未归档。当前环境 blocker本身不需要新proposal；任何 threshold、workload、persistence、deployment或用户可见语义变化仍需新的OpenSpec决定。
- Superpowers：当前 plan/Preflight只授权 resume-003 one-shot链；该链已在Java start消耗并停止，不授权retry、第四次resume、repair或新的implementation plan。
- Git/发布：Git add/commit/push、正式 Gate D、archive、merge、tag、Dashboard transition、evidence/worktree cleanup全部保持禁止。
- 项目规则：未修改。

## 验证记录

- Plan SHA check：exit `0`，匹配 `7e40326603d7a0a56d33d720cecab5a5125c8ab442f3d16bf930634f86989019`。
- Preflight SHA check：exit `0`，匹配 `1e8286df82a2a453dc146037182214c0de410201642025cf638b586ce2f48da7`，当前结论 `PASS`。
- Exact Step 1：exit `0`，initial disk `142967632 KiB`，protected pre tuple通过。
- Credential selfcheck：exit `0`，stdout `0` bytes。
- Java start：exit `127`，fresh log consumed，PID absent。
- Exact PID-based cleanup：exit `101`，因PID evidence未形成；没有signal。
- Supplemental no-owner cleanup observation：exit `0`，port `18084` free，Runtime/MCP fingerprints zero。
- Protected post-stat：exit `0`，tuple与sidecar absence保持不变。
- 三variants、九observers、三validators、analyze、success diagnosis Review与`22/23/5` audit：not run。
