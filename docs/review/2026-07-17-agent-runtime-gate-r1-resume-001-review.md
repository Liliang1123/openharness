# Agent Runtime Gate R1 Resume-001 Review

## 结论

需修改 / **BLOCKED**：Task 6 `resume-001` 没有形成任何可评审的 Gate R1 workload/performance 结果。`full-oracle` 已启动并 claim 目标，但控制面在无法从 observer 工具结果取得结构化 `exit_code + PID/PPID chain` 时，先按 fail-closed 停止了 active run；随后到达的纠正后只读 `ps` 结果才证明当时存在完整执行链。运行最终退出 `130`，[full-001 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001-report.json) 为 `0` 字节，没有 samples 或结构化 report；[full-001 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite) 是 `240,963,584` 字节 partial artifact。两者以及自动产生的 [full-001 singleton lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite.lock) 均已消费，必须永久保留且不得复用、修补、截断或覆盖。

本次是 **external interruption / observer evidence protocol failure**，不是 Java/MCP capability、Runtime、workload、admission threshold 或数据库 oracle 的失败。没有 full samples、没有另外两个 variants、没有 analyze/decision，因此不得提出 admission 根因或性能修复。

Reviewer 未启动、重试、profile、run 或 analyze，未读取或 hash 三个受保护 SQLite/lock 内容；唯一写入是本 Review。未修改计划、Preflight、源码、测试、OpenSpec、Dashboard、package、lockfile或 evidence。

## Review 范围

- 工作树：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `2076369498ab2ef12e3d37f1a2d02962bb198a05ccfc12c67522da906e7d4514`
- Strict Preflight：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，SHA-256 `d1238ac68beee0c40abe8d1fb55bb1cb7b678d3dd2e80374a00507ee9b5c6c2e`
- Attempt-001 BLOCKED Review：[2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md)，SHA-256 `9a1572d70dc2969d2e15eff3a1fddbf11d95051763516cb73e6476c7d34f44dc`
- 已保留 profile：[attempt-002-profile.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)
- Attempt-001 Java 控制证据：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.log) 与 [java-gateway-18084.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.pid)
- Resume-001 Java 控制证据：[java-gateway-18084-resume-001.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-001.log) 与 [java-gateway-18084-resume-001.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-001.pid)
- Resume-001 partial full pair：[gate-r1-full-001.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite)、[gate-r1-full-001.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite.lock) 与 [gate-r1-full-001-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001-report.json)
- Analyzer binding implementation：[gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- Runtime singleton lock implementation：[singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts) 与 [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- 执行器/控制面交接记录：observer 首次只产生空 stdout、没有可用于决策的 exit code；30 秒后 active run 被停止；纠正后的受控只读 `LC_ALL=C ps` 返回 `0` 并观察到 CLI `2167` → child `2173` → formal Runtime child `2185` → MCP `2223/2229`，但该结果到达时停止已经发生。该历史由执行交接提供；当前 Review 只独立复核可持久化制品与清理后的主机状态。

## 主要发现

### High — Observer 证据协议存在竞态，导致正在运行的 full-oracle 被控制面误停

计划要求控制面在 run 活跃时观察 descendant PID/fingerprint，但没有绑定一个必定返回结构化 `exit_code`、PID、PPID 和分类的 observer 命令，也没有定义 observer 调用尚未返回、返回空 stdout、工具层没有 exit code、以及后到纠正结果之间的 decision wait/stop 状态机。

本次首次 observer 结果只有空 stdout，无法证明“无进程”，也无法证明命令成功。控制面等待约 30 秒后先停止 active run；纠正后的只读观察随后证明执行链当时完整。因此停止不是 workload 产生的 failure，而是控制面把“不完整观察证据”转化成 stop decision 所致。

执行器在无法继续证明子进程所有权时停止 active diagnostic、清理自有 Java 并保留 partial artifacts，符合计划 fail-closed 与 interruption cleanup 的安全意图；但触发停止的 observer 证据并不满足计划可审计的 positive/negative 判定合同。安全 cleanup 正确，控制面证据协议不完整，二者必须分开表述。

### High — full-001 已消费但没有 report，不能复用也不能支持性能归因

独立 stat/hash 结果：

- [full-001 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite)：regular mode `0600`，`240,963,584` 字节，SHA-256 `cc90a03bbb4887b7b2705768fe3ef357e7b1c8889d9f7564d02c32abb596714f`。
- [full-001 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001-report.json)：regular mode `0600`，`0` 字节，SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- [full-001 singleton lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite.lock)：regular mode `0600`，`0` 字节，SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。

空 report 不能结构化解析，也没有 60 samples、hard-failure list、probe signature 或 environment fingerprint。Reviewer 按边界只 stat/hash 新数据库，没有打开或查询 partial SQLite；其内容不得被拿来补造报告或推断趋势。

### Medium — 自动 singleton lock 未进入计划的目标清单与最终扫描合同

[runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts) 会为数据库路径创建持久化的 `.lock` 文件，[singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts) 关闭 descriptor 时释放锁但不会删除文件。实际 [full-001 singleton lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/gate-r1-full-001.sqlite.lock) 证明该行为。

当前计划把 resume-001 定义为九个 fresh one-shot targets，并在最终十二 evidence targets 中遗漏三次 run 各自的 `.lock` sidecar。该遗漏不改变本次主要 blocker，但 resume-002 修订必须把旧 lock 纳入 consumed preservation，并为所有新 run 明确 expected lock sidecar、mode、no-follow、identity 与 sensitive scan 合同。

### Pass — 已消费与仍 fresh 的边界可机械区分

- Resume-001 授权的九个 one-shot targets 中，已消费 `4` 个：resume Java log/PID、full database/report；仍 fresh `5` 个：workload database/report、incremental database/report、decision。
- 除九目标外，full run 自动新增并消费 `1` 个 singleton lock sidecar。
- 连同 attempt-001 已消费的 profile/original Java log/PID，目前 Gate R1 目录共有 `8` 个应保留 physical files。
- `gate-r1-full-001` runId 已消费；`gate-r1-workload-001` 与 `gate-r1-incremental-001` 尚未 claim。没有 diagnosis Review。

仍 fresh 的目标已通过 no-follow presence 检查确认为 absent；[performance-recovery directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/) 与 [Gate R1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/) 均为 non-symlink mode `0700` directories。

### Pass — 既有 profile/Java 证据未变化，resume Java 与主机进程已清理

- [attempt-002-profile.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)：mode `0600`，SHA-256 `bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541`，与计划固定值一致。
- [java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.log)：mode `0600`，SHA-256 `18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02`，与计划固定值一致。
- [java-gateway-18084.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.pid)：mode `0600`，SHA-256 `db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089`，与计划固定值一致。
- [java-gateway-18084-resume-001.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-001.log)：mode `0600`，`99,731,235` 字节，SHA-256 `5e103d31edf342e6ec0f6121141517a0c0196cbbe6c644985dda16351216c52f`。
- [java-gateway-18084-resume-001.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-001.pid)：mode `0600`，`6` 字节，SHA-256 `4667fcf59d1f03c1db90f299b115525df71eb7da8d3cc46211e6a18fa8f5f1c7`。

当前 fresh checks：端口 `18084` 没有 listener；resume PID 对应进程已退出；受控 `LC_ALL=C ps` 对 diagnostic CLI、`formalSoakRuntimeChild.ts` 与 qualification MCP fixture 的分离字符串扫描均无匹配。generic sensitive patterns 与 actual reviewed raw token 的非打印扫描对现存 text/JSON/PID evidence 均 clean；Review 没有输出 token。SQLite artifacts 依任务边界仅 stat/hash，没有内容扫描。

### Pass — 受保护输入只执行 stat，attempt-002 identity 与计划完全一致

Reviewer 没有打开、读取或 hash 下列受保护内容：

- [attempt-001 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/runtime.sqlite)：当前 stat `dev:ino:size:mtime:ctime = 16777232:165255105:0:1784164996:1784165109`。
- [attempt-002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：当前 stat `16777232:165257457:1835978752:1784167299:1784167299`，与计划固定 tuple 完全一致；`-wal` 与 `-shm` 仍 absent。
- [attempt-002 runtime.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite.lock)：当前 stat `16777232:165257942:0:1784165719:1784165719`。

## 最终建议

只提出最小 `resume-002` 计划修订，不在本 Review 修改计划：

1. 保留现有全部八个 Gate R1 files，包括 partial full-001 database、empty report 与 singleton lock；禁止删除、重命名、打开补写、复用、truncate、chmod 或覆盖。
2. full variant 必须使用全新 `gate-r1-full-002` runId，并 claim 全新 `gate-r1-full-002` database/report；计划同时承认其 expected `.sqlite.lock` sidecar。不得复用 full-001 的任何 basename。
3. 增加全新 [java-gateway-18084-resume-002.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-002.log) 与 [java-gateway-18084-resume-002.pid](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084-resume-002.pid) one-shot control evidence。
4. [gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts) 的 analyzer 只要求三份 report path、runId 与 database basename 分别 distinct，并要求 Node version/platform/architecture fingerprint 一致；它不要求三个 runId 使用同一数字 suffix。因此若新计划 Preflight 再次证明 workload/incremental/decision 原 001 targets 均 absent，最小恢复可保留 `gate-r1-workload-001`、`gate-r1-incremental-001` 和原 fresh decision target。没有技术必要把三组全部改为 `002`，但这一 mixed-attempt binding 必须在修订计划和最终 Review 中显式列出，不能由执行器临场决定。
5. 用一个明确的 structured read-only observer 替代模糊观察：单次调用必须返回工具 `exit_code` 以及 machine-readable PID、PPID、process kind 和完整 parent-child relation；从一开始按需要使用已授权的受控 `LC_ALL=C ps`，避免先在沙箱内得到不可判定结果再补调用。
6. 定义无竞态控制面规则：observer 完成前不得从空 stdout 推断“无进程”或停止；`exit 0 + coherent chain` 才继续，结构化 `no match/incoherent chain` 才按计划停止；工具 transport failure、缺少 exit code 或不完整 payload 必须明确归类为 observer `BLOCKED`，并由同一 revision 规定 active run 的确定性 wait/stop 顺序。禁止使用任意 30 秒超时后先 stop、后接收纠正结果的协议。
7. 新 revision 必须重新执行 exact prestate、protected stat、credential selfcheck、fresh-target/sidecar、Java ownership 和 observer protocol 的独立 strict Preflight。只有 Preflight PASS 且用户明确批准 `resume-002` 后，才能再次启动 Java 或 run；不得把本 Review 当成执行授权。

## 后续门禁

- 当前状态：Task 6 / Gate R1 `BLOCKED`；不得启动 workload/incremental、analyze 或第二次恢复。
- OpenSpec：无需新增 proposal；这是现有 local-only strict diagnostic execution plan 的证据协议与 fresh-target 修订。若改变 fixed workload、threshold、持久化/生产语义或公开行为，仍需新 OpenSpec。
- Superpowers：修订权威计划后必须先独立 strict Preflight PASS，再取得用户对 `resume-002` 的明确授权；实际 evidence 形成后仍需独立 strict High Review。
- Git/发布：正式 Gate D、performance repair、`git add`/commit/push、OpenSpec archive、main merge、tag、evidence/worktree cleanup 全部继续禁止。
- Dashboard：未触发同步点。
- 项目规则：未修改。
- Diff：`git diff --check` exit `0`；本 Review 之外未写入任何文件。
