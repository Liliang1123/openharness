# Agent Runtime Gate R1 Execution Attempt 001 Review

## 结论

需修改：**Task 6 / Gate R1 execution attempt 001 为 `BLOCKED`，未完成。** Immutable attempt 002 profile 是有效且可保留的已完成子步骤；但首个 `full-oracle` wrapper 在进入 `pnpm`/diagnostic CLI 前以 `97` 退出，三个固定 30 分钟 variants 均从未开始，analyze 与最终 diagnosis 也未执行。因此本轮没有 admission 性能归因结论，不能把有效 profile 或成功 cleanup 表述为 Task 6/Gate R1 PASS。

直接 blocker 是权威计划两处 token 提取命令在 macOS BSD `/usr/bin/sed` 上使用了 GNU 风格 BRE `\+`。该表达式没有匹配 reviewed declaration，`sed` 仍以 `0` 退出并产生空输出，随后 nonblank assertion 返回 `97`。这是执行计划的 host-portability 缺陷，不是 Java/MCP、Runtime、workload 或 admission 性能失败。

本 Review 只记录 blocked attempt、证据保全与最小恢复合同；未启动或重试 Java/profile/run/analyze，未读取或 hash 受保护 SQLite/lock，未修改计划、Preflight、源码、测试、OpenSpec、Dashboard、package、lockfile或 evidence。

## Review 范围

- 实际工作树：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `3693da967ef35fcf9d588c4b36b34840626228d839313ff2976fe1ed6f9d32bf`
- Task 6 strict Preflight：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，SHA-256 `8104e2381efe98a918a20b821461d1e566e0629941650ebe468ae826413e56db`
- Task 5 strict High Review：[2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)，SHA-256 `680fa7aa4053b1bbfe27504012bdd01856db894126a55553e2785d982fd110c1`
- Gate R1 evidence parent：[performance-recovery](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/)
- Gate R1 evidence directory：[gate-r1](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- 有效 immutable profile：[attempt-002-profile.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)，mode `0600`，SHA-256 `bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541`
- 已消费 Java lifecycle log：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.log)，mode `0600`，SHA-256 `18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02`
- 已消费 Java PID record：[java-gateway-18084.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.pid)，mode `0600`，SHA-256 `db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089`
- Reviewed local auth declaration：[AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- 预定但未生成的最终 diagnosis Review：[2026-07-17-agent-runtime-gate-r1-diagnosis-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

### 受保护输入边界

以下制品仅执行 `git status`/`stat`；本 Review 未读取、打开、hash、复制、移动、删除或写入其内容：

- [attempt 001 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/runtime.sqlite)：size `0`，mtime epoch `1784164996`，mode `0600`
- [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：current tuple `16777232:165257457:1835978752:1784167299:1784167299`，mode `0600`
- [attempt 002 runtime.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite.lock)：size `0`，mtime epoch `1784165719`，mode `0600`

执行器记录的 attempt 002 pre/post main tuple均为 `16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM 均为 absent；独立 Reviewer 的当前 `stat` 与该 main tuple及 sidecar absence一致。

## 主要发现

### High — 权威 token extraction 在当前 macOS host 确定性返回空值

系统化复核得到：

1. `AUTH_FILTER` 在 plan function 的 subshell 中可继承且指向现存 regular file；问题不是变量 scope。
2. fixed declaration 的 `awk` 计数为 exact `1`；问题不是 declaration 缺失或重复。
3. 计划在 Step 4 run wrapper 与 Step 8 scan 中各使用一次 `[^\"]\+`，共 exact `2` 处。
4. 在当前 macOS `/usr/bin/sed` 上按计划原样运行，raw extraction length 为 `0`。`sed` 的 exit code仍为 `0`，因此紧邻的 `|| exit 97` 不会触发；随后 `test -n` 才使 wrapper退出 `97`。
5. 把 capture quantifier机械替换为 POSIX BRE interval `[^\"]\{1,\}` 后，提取长度为 `17`，whitespace count为 `0`，`Bearer ` prefix count为 `0`；整个验证过程没有打印 token 值。

因此最小修正是同时修改计划中 run wrapper 和最终 evidence scan 两处 regex，不能只修第一处，否则后续 Step 8仍会确定性失败。

### High — Gate R1 证据链停在 profile/Java prerequisite，三个实验变量没有任何样本

- 首次 profile invocation 遇到 sandbox `tsx` spawn `EPERM`，发生在 CLI启动和 output claim之前；当时 profile target仍 absent。执行器随后按平台 permission规则用同一精确命令 escalated重跑并 exit `0`，没有改变 CLI flags、input或output basename。
- profile机械结构校验 PASS：`schemaVersion=1`、local track、offline-profile evidence kind、`databaseBytes=1835978752`、`runtime_events=2671288`、pending=`2671288`、nonpending=`0`、ordered query plans=`15`；禁止 path/URI/raw child output/secret strings扫描 PASS。
- Java log包含 lifecycle readiness markers且没有 startup/build failure marker；PID record为单行 numeric。full wrapper随后在读取空 token结果时 exit `97`，位于 `pnpm`/CLI/Java-MCP probes/Runtime spawn之前。
- `full-oracle` 的 database/report均 absent；`workload-only` database/report、`incremental-oracle` database/report及decision也均 absent。也就是说 planned十个 evidence targets仅生成并消费 `3/10`（profile、original Java log、original PID），其余 run/analyze targets `7/10` 未 claim；最终 diagnosis Review也 absent。
- 因三个 30 分钟 variants均从未开始，当前证据不能比较 full/incremental/workload slopes、last-window latency或oracle contention；admission性能根因仍未决定。

### Medium — Preflight 对“表达式意图”给出了 PASS，但没有绑定 exact BSD sed 运行证据

Preflight声称 raw-token提取在不输出值的条件下通过，但没有保存 exact plan regex在当前 `/usr/bin/sed` 上的 extraction-length与退出语义。GNU BRE中的 `\+` 假设因此未被发现；同时 `sed` 对零匹配仍返回 `0`，仅检查 command status也无法捕获该错误。

后续 strict Preflight必须对两处最终表达式执行 nonprinting host probe，并同时断言：declaration count exact `1`、extracted length大于 `0`、无 whitespace、无 `Bearer ` prefix、实际值不进入输出。仅静态阅读或只看 `sed` exit code不足以重新授权。

### Pass — BLOCKED 后的证据保全与 owned process cleanup 已完成

- [performance-recovery](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/) 与 [gate-r1](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/) 均为 non-symlink directory、mode `0700`，未删除或重建。
- original profile/log/PID均为 mode `0600`，未覆盖、truncate、rename或删除。
- Java owner已通过原 PTY发送 Ctrl-C并完成退出；独立复核确认 PID已退出、`18084`无 listener、Gate R1 Runtime orphan=`0`、reviewed qualification MCP orphan=`0`。
- 已消费证据的通用 secret pattern与actual reviewed token非打印扫描均 PASS；`git diff --check` PASS。

## 最终建议

按以下**最小 resume contract**修订并重新批准，不得在当前 revision 下自动重试：

1. 保留现存 [performance-recovery](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/)、[gate-r1](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)、[attempt-002-profile.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)、[original Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.log)和[original PID record](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.pid)原样不动；resume不得再次 profile attempt 002，不得覆盖或复用这三份文件。
2. 只修改权威计划两处 token capture quantifier为POSIX BRE interval，并加入上述 nonprinting exact-host regression。该修订不需要源码、测试、OpenSpec或Dashboard变化。
3. 为 resume固定两个全新 one-shot Java evidence basenames：`java-gateway-18084-resume-001.log` 与 `java-gateway-18084-resume-001.pid`，继续使用同一 isolated port和原有 ownership/cleanup合同。原 log/PID不能删除、rename或复用。
4. `gate-r1-full-001`、`gate-r1-workload-001`、`gate-r1-incremental-001` 的runId、database/report basenames，以及 `gate-r1-decision.json` 均保持不变，因为这些 targets从未 claim；不得为它们发明新 runId或新 basename。
5. Step 8 scan set必须从原十个 evidence files扩展为现存profile、original log/PID、三个run的六个targets、decision、两个resume log/PID和最终Review；同时保留actual token、generic secret、JSON structure/path/URI/raw-child及mode检查。
6. 计划产生新 SHA 后，必须重新执行独立 strict Task 6 Preflight；只有Preflight PASS且用户明确批准新增的两个 resume Java basenames后，才允许从“启动 fresh Java owner”继续。resume必须先再次确认 profile SHA/结构、attempt 002 current stat与sidecar absence、所有run/analyze targets仍fresh、port/process无owner冲突。

禁止自动重试、换runId、删除失败证据、重做profile或在没有新 revision/Preflight/用户批准时启动服务。若任何 run target在批准前被 claim，必须再次停止并修订合同，不能现场改名继续。

## 后续门禁

- **Task 6 / Gate R1：`BLOCKED`。** 本 attempt未完成；三个30分钟variants、analyze和根因决定均待新的resume授权。
- **OpenSpec：** 不需要新增或修改；本 blocker是已批准local-only执行计划的host-portability修正，不改变threshold、workload、持久化语义、公开API、production行为或部署契约。
- **Superpowers plan：** 必须修订当前计划、形成新SHA并重新strict Preflight；不能由执行器在shell中临场替换regex。
- **用户审批：** 必须明确批准两个新增resume Java evidence basenames后才可继续。
- **Dashboard：** 不触发 proposed/verified/archived同步；不得修改。
- **仍禁止：** 正式Gate D、任何性能修复实现、OpenSpec archive、Git add/commit/push、merge、tag、evidence/worktree cleanup、删除或覆盖任何已消费证据。
- **项目规则：** 未修改。
