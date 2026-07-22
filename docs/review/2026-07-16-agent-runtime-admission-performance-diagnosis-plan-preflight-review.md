# Agent Runtime Admission Performance Diagnosis Plan Preflight Review

## Task 6 resume-004 Preflight-002 / plan SHA `707fb83e` 当前结论

通过：**Task 6 resume-004 Preflight-002 strict Preflight PASS**。本轮独立绑定 [resume-004 executable plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md) SHA-256 `707fb83ee81e7faed394fc11afeeedf7f0c4f8c18c9de2747a7f963eaabe7fc1` 与 [canonical Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md) 更新前 SHA-256 `9f85c26c43aad19583b20a4711503a84c9b12ef9f9d626946aeb83e2304a2661`，并 fresh 完成 A–G 全部检查；未复用此前 Reviewer 结论。

本轮唯一 actual-host observer 使用当前 control-plane filesystem `unrestricted` / `danger-full-access`、approval policy `never`，第一次且唯一一次 shell-start 直接提交完整 `pre-run-clean / gate-r1-full-002` observer block；调用省略 `sandbox_permissions` 与 `justification`，固定 `yield_time_ms=10000`。tool result 形态为 `immediate-numeric`，未 retained、poll count `0`、final exit `0`，complete stdout 精确为唯一 sanitized row：`observer=pre-run-clean runId=gate-r1-full-002 reason=clean role=none pid=0 ppid=0`；结构 verdict 为 `PASS`。未启动第二个 observer exec/shell、fallback、retry、异步修正或 external coordination。

本轮未启动 Java、profile、三个 variants、analyze 或正式 Gate D，未 claim 或创建任何 resume-004 fresh evidence。受保护 attempt-002 主 SQLite 只执行固定 no-follow/type/`stat` tuple 检查；未 hash、open、query、copy、move、rename、chmod、write 或触碰 sidecar。唯一写入是本 canonical Review；未修改计划、源码、测试、项目规则、OpenSpec、Dashboard 或其他 Review，未执行 Git add/commit/push、OpenSpec archive、merge、tag、repair 或 evidence/worktree cleanup。

## Task 6 resume-004 Preflight-002 Review 范围

- 项目根规则：[root AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- 工作树规则：[worktree AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)
- OpenSpec 规则：[openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- 可执行计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `707fb83ee81e7faed394fc11afeeedf7f0c4f8c18c9de2747a7f963eaabe7fc1`
- Canonical Review 与全部既有历史：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前 SHA-256 `9f85c26c43aad19583b20a4711503a84c9b12ef9f9d626946aeb83e2304a2661`
- Resume-003 执行 Review：[2026-07-21-agent-runtime-gate-r1-resume-003-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-review.md)，SHA-256 `0186e3280832ef5ccb5addef762830bdd809c8b297d4cb4b960798daae120b0b`
- Resume-003 独立 Review：[2026-07-21-agent-runtime-gate-r1-resume-003-independent-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-independent-review.md)，SHA-256 `954e2505601d903b04fc9151d14a937b07ff5d136555c456c61171b0759ba653`
- Gate R1 evidence：[gate-r1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- 受保护输入：[attempt-002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)，仅固定 `stat`
- Credential declaration：[AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)，仅 nonprinting selfcheck
- Maven binding：[launcher](file:///opt/homebrew/bin/mvn) 与 [real target](file:///opt/homebrew/Cellar/maven/3.9.16/bin/mvn)
- Success diagnosis Review target：[2026-07-17-agent-runtime-gate-r1-diagnosis-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)，保持 absent/no-follow
- Contingent execution BLOCKED Review target：[2026-07-21-agent-runtime-gate-r1-resume-004-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md)，保持 absent/no-follow

## Task 6 resume-004 Preflight-002 主要发现

### Pass — A：固定 Maven binding 与 Java runtime 精确匹配

- [Maven launcher](file:///opt/homebrew/bin/mvn) 是 symlink，readlink 精确为 `../Cellar/maven/3.9.16/bin/mvn`；[real target](file:///opt/homebrew/Cellar/maven/3.9.16/bin/mvn) 是 non-symlink regular executable。
- Launcher 与 real target 的 dereferenced SHA-256 均为 `840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1`。
- `-version` first line 精确为 Maven `3.9.16`、revision `2bdd9fddda4b155ebf8000e807eb73fd829a51d5`；Java context 为 `26.0.1`。
- 未运行 Homebrew、安装、升级、relink、wrapper、bare `mvn`、PATH lookup 或 fallback。

### Pass — B：Step 1 prestate、资源与 evidence counts 完整通过

- Historical `11`、fresh `12`、success evidence `23`、scan `24`、valid JSON `5` 均与计划一致；full/workload/incremental 三份 singleton lock 均进入 fresh 与 final audit 合同。
- 十一份 historical evidence 全部为 non-symlink mode `0600`，size/SHA 与固定 binding 一致；resume-003 log size `31`、SHA-256 `4707abc6949e53eb9225dc8181e2be5e3c6201ad35d9c33cab43bb627992dfd7`，resume-003 PID 保持 absent/no-follow。
- 两份 resume-003 Review SHA 与范围中 binding 一致；十二份 resume-004 targets、success diagnosis Review 与 contingent execution BLOCKED Review均 absent/no-follow。
- Protected tuple 精确为 `16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent；initial disk `available_kib=140484152`，高于 `12582912 KiB`；port `18084` clean。未清理任何 evidence 以获得空间。
- Existing immutable profile 的 local/offline discriminants、`databaseBytes=1835978752`、`runtime_events=2671288`、pending `2671288`、非pending全零、其他四表非负整数及 exact `15` query plans机械通过。

### Pass — C：Credential prerequisite nonprinting 通过

- [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java) exact declaration count、POSIX BRE raw extraction、nonblank/no-whitespace/no-double-Bearer checks通过。
- Selfcheck未输出 credential value、length、source line、header、environment 或 secret；未执行三个 run wrappers。

### Pass — D：18 个 Task 6 Bash fences 与静态语义通过

- Task 6 精确包含 `18` 个 `bash` fences；逐个通过 `bash -n` 与 `zsh -n`，合计 `36` 次 syntax checks。
- 静态扫描确认 protected input在执行 fences中只有固定 stat-only用法；Preflight未运行任何会写 evidence 的 Java/run/analyze/final-audit command。
- Execution fences不存在 formal Gate D、OpenSpec archive、Git write、Homebrew、bare Maven、wrapper、profile retry或 repair命令。

### Pass — E：Result-state collector 与唯一 actual-host observer 均闭合

- Fresh no-file `7`-case collector matrix结果：immediate integer exit `0` + single clean row `PASS`；retained positive same-session后 integer exit `0`并按返回顺序拼接同一 clean row `PASS`；missing exit/session、changed session、non-integer exit、20次同-session无exit timeout、exit `0`附带额外stdout均按预期 `BLOCKED`。
- Matrix证明所有poll仅使用同一 retained session、`chars` empty、`yield_time_ms=5000`，最多 `20` polls / `100` seconds，且从不启动第二个 `exec_command`。
- Actual-host结果形态：initial `immediate-numeric`；retained `false`；poll count `0`；final exit `0`；complete stdout精确为 `observer=pre-run-clean runId=gate-r1-full-002 reason=clean role=none pid=0 ppid=0`；structural verdict `PASS`。未记录 numeric session id、command、environment、path、process snapshot或secret。

### Pass — F：Fresh 13-case no-file observer-shell matrix 通过

- Synthetic pre/post clean exit `0`；pre/post process-present exit `41`；pre/post snapshot-failure exit `45`。
- Active coherent selected CLI → bridge → Runtime → MCP chain exit `0`；wrong ancestry、duplicate、current-missing、clean-timeout与coherent selected chain + foreign-run CLI均exit `41`；active snapshot acquisition failure exit `45`。
- Foreign-run fixture保留selected/current与foreign两条 sanitized CLI candidate rows；全部stdout符合固定reason/role schema，不含command、environment、path或secret。
- Matrix通过合成 `ps` 与无等待 `sleep`注入运行当前observer block，filesystem writes `0`、real process-table reads `0`，不构成第二个actual-host observer。首个验证器外壳曾在形成矩阵结论前命中zsh保留只读变量名；独立复现确认根因仅在Reviewer外层变量，最小更名后完整fresh `13/13`重跑通过，未重跑actual-host observer或改变计划。

### Pass with Git-baseline limitation — G：静态执行与终审合同一致

- 九个authorized observer rows均绑定单一 `exec_command`、`yield_time_ms=10000`、omitted `sandbox_permissions` / `justification`；Task 6内 `require_escalated`为零。同session empty polling、20-poll bound、no-second-exec、run-session long polling分界均存在。
- 三个runId、variant、database/report/lock、validator与analyze映射精确；固定 `1800000 ms` / `30000 ms` / exact `60` samples、7/0/1 probe signatures、zero hard failures合同存在。
- Java start唯一 executable为 exact Maven launcher；resume-004 log/PID owner、protected post-stat、owned cleanup、decision enums、no fifth resume、no retry/fallback、self-hash external-only及generic/exact-token/root-path/raw-output negative scans均存在。
- Final arrays机械为 historical `11` + fresh `12` = evidence `23`、scan `24`、JSON `5`；三份lock均进入audit。
- `git diff --check`、cached diff check与plan no-index whitespace check通过；全部检查后plan SHA仍为 `707fb83ee81e7faed394fc11afeeedf7f0c4f8c18c9de2747a7f963eaabe7fc1`。
- Plan与canonical Review在当前worktree均为既有untracked artifacts，没有可用HEAD plan blob进行relative-HEAD targeted hunk比较；本轮以用户给定input SHA、静态Task 6机制检查、plan前后SHA不变和whitespace checks为审计依据，不把不可用的HEAD比较伪装成额外PASS。

## Task 6 resume-004 Preflight-002 最终建议

授权且仅授权同一 `resume-004`、同一计划 SHA `707fb83ee81e7faed394fc11afeeedf7f0c4f8c18c9de2747a7f963eaabe7fc1` 中既有的三个固定 `30` 分钟 variants完整链：`gate-r1-full-002 / full-oracle` → `gate-r1-workload-001 / workload-only` → `gate-r1-incremental-001 / incremental-oracle`，以及计划为这三者固定的prestate、credential、resume-004 Java owner/readiness、九个single-shell observers、isolated validators、analyze、owned process cleanup、protected post-stat、互斥Review与final audit。

执行时必须从exact Step 1重新验证current state。任何 metadata、Maven、credential、freshness、disk、listener、observer result-state/exit/structure、run、sample、lock、mode、analyze、ownership、cleanup、protected tuple、secret scan或plan SHA mismatch都立即使授权失效并返回 `BLOCKED`；不得retry、第五次resume、改runId/basename、缩短duration、改变workload/threshold、清理evidence或临场修订计划。

## Task 6 resume-004 Preflight-002 后续门禁

- Preflight：`PASS`；仅授权上述 plan SHA 与同一 resume-004 三个固定 `30` 分钟 variants既有链。计划内容或SHA变化必须重新独立strict Preflight。
- OpenSpec：无需新增或修改；active [harden-agent-runtime-single-node-production change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/) 保持未归档。本PASS不授权archive。
- Superpowers：无需新建实施计划；现有计划可进入上述受限执行。执行完成后仍须独立strict High Review接受claim-to-mechanism chain，且只有decision=`confirmed`才可能使Gate R1 PASS。
- 后续repair plan：当前不创建；只有Gate R1确认根因并通过独立strict High Review后，才进入单独的recovery implementation plan。
- 明确不授权：another profile、Java/variant范围外操作、正式Gate D、performance repair、修改plan/source/tests/OpenSpec/Dashboard/其他Review、Git add/commit/push、OpenSpec archive、merge、tag、evidence/worktree cleanup或项目规则修改。
- Dashboard：不触发同步。
- 项目规则：未修改。

## Task 6 resume-004 revision `d532b071` 当前结论

需修改 / **BLOCKED**：Task 6 resume-004 计划 SHA-256 `d532b0715f184a626b1f7e0888290f15ba7605f5d0f1eef5230fa05213215c23` 与本轮输入精确绑定；exact Maven/Step 1、credential、十八个 fences、九个 observer envelope、十三项 no-file synthetic matrix 和静态 negative audit均已 fresh复核。但 strict Preflight要求的第一次且唯一一次 actual-host `pre-run-clean / gate-r1-full-002` tool result没有提供 numeric exit code，也没有提供唯一 sanitized clean row；control-plane结果只能记录为缺失 numeric outcome，不能等价为 exit `0`。

本轮 actual-host调用直接使用 `exec_command`，省略 `sandbox_permissions` 与 `justification`，没有 ordinary sandbox、fallback、escalation、retry、第二次 observer、异步修正或 external coordination。按计划 fail-closed合同，缺少 numeric exit与结构化 stdout立即使本revision `BLOCKED`；这不是 process-present、Maven、Java、Runtime、MCP、workload、database-oracle或performance结论。

本轮未启动 Java/profile/run/analyze，未 claim 或创建任何 resume-004 fresh target。受保护 attempt-002 database只执行计划固定 `stat`，未 hash、open、query、copy或触碰sidecars。唯一写入是本 canonical Preflight Review；未修改计划、source、tests、OpenSpec、Dashboard、Git或项目规则，也未执行正式 Gate D、repair、archive、merge、tag或cleanup。

## Task 6 resume-004 revision `d532b071` Review 范围

- [Resume-004 executable plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`d532b0715f184a626b1f7e0888290f15ba7605f5d0f1eef5230fa05213215c23`
- [Canonical Preflight Review及全部既有轮次历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前 SHA-256：`1e8286df82a2a453dc146037182214c0de410201642025cf638b586ce2f48da7`
- [Project AGENTS rules](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)
- [OpenSpec AGENTS rules](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- [Resume-003 execution BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-review.md)，SHA-256：`0186e3280832ef5ccb5addef762830bdd809c8b297d4cb4b960798daae120b0b`
- [Resume-003 independent Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-independent-review.md)，SHA-256：`954e2505601d903b04fc9151d14a937b07ff5d136555c456c61171b0759ba653`
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Protected attempt-002 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：仅固定 `stat`
- [Credential declaration source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)：仅执行零输出 extraction selfcheck
- [Exact Maven launcher](file:///opt/homebrew/bin/mvn) 与 [exact Maven real target](file:///opt/homebrew/Cellar/maven/3.9.16/bin/mvn)：仅执行固定 type/readlink/hash/version检查
- [Success diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)：保持 fresh/no-follow
- [Contingent resume-004 execution BLOCKED Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md)：保持 fresh/no-follow；本轮是Preflight阻断，不创建execution Review

## Task 6 resume-004 revision `d532b071` 主要发现

### Pass — A：Exact Maven binding在任何claim前完整通过

- Exact Step 1 numeric exit `0`。Maven launcher是symlink，readlink精确为 `../Cellar/maven/3.9.16/bin/mvn`；real target为non-symlink regular executable。
- Launcher与real target的dereferenced SHA-256均为 `840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1`；`-version`第一行精确为 `Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)`。
- 未执行 `brew`、安装、升级、relink、wrapper、PATH lookup或fallback。

### Pass — B/C：Exact Step 1与credential selfcheck符合固定prestate

- 十一份historical evidence全部为non-symlink mode `0600`，size/SHA逐项匹配；其中resume-003 log为size `31`、SHA-256 `4707abc6949e53eb9225dc8181e2be5e3c6201ad35d9c33cab43bb627992dfd7`，resume-003 PID保持 absent/no-follow。
- 十二份resume-004/run fresh targets、success diagnosis Review与contingent resume-004 execution BLOCKED Review全部 absent/no-follow。Existing profile固定结构断言通过；三份singleton lock均在fresh合同内。
- 受保护 database tuple精确为 `16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent且只执行固定 `stat`；initial disk为 `available_kib=141589304`，高于 `12582912 KiB`；port `18084`无listener。
- Credential selfcheck numeric exit `0`、stdout `0` bytes；未输出credential value、length或source line。

### Pass — D：十八个 Task 6 fences均可由两种shell解析

- Task 6精确包含十八个 `bash` fences；每个分别通过 `bash -n` 与 `zsh -n`，合计三十六次syntax check。

### Blocking — E：唯一actual-host observer没有形成numeric clean evidence

- 当前control-plane metadata与计划绑定一致：filesystem `unrestricted` / `danger-full-access`，approval policy `never`。
- 九个authorized observer rows均精确声明 `exec_command`，`sandbox_permissions` omitted，`justification` omitted；Task 6内 `require_escalated`计数为零。
- 第一次且唯一一次actual-host调用按上述omitted-field envelope提交完整observer fence并以 `pre-run-clean / gate-r1-full-002`为目标。该tool result没有numeric exit code且stdout为空，未形成计划要求的唯一 `observer=pre-run-clean runId=gate-r1-full-002 reason=clean role=none pid=0 ppid=0` row。
- 没有fallback、retry或第二次actual-host observer。缺少exit/row本身就是tool-envelope blocker；不能从Step 1的port结果外推process-table clean，也不能用synthetic结果替代actual-host evidence。

### Pass — F：Fresh十三项no-file synthetic matrix完整通过

- Pre/post clean均exit `0`；pre/post process-present均exit `41`；pre/post snapshot-failure均exit `45`。
- Active coherent CLI → bridge → Runtime → MCP chain exit `0`；wrong ancestry、duplicate、current-missing与clean-timeout均exit `41`；active snapshot failure exit `45`。
- Coherent selected chain加独立foreign-run CLI exit `41`；sanitized stdout同时保留current CLI PID `100`与foreign CLI PID `104` rows，并通过禁词检查，不含command、environment、path或secret text。
- Synthetic通过shell-function snapshot injection执行当前计划observer block，不创建文件且不读取真实process table，因此不构成第二次actual-host observer。

### Pass with recorded Git-baseline limitation — G：Counts、locks、Java命名与negative合同一致

- Static counts精确为historical `11`、fresh `12`、evidence `23`、scan `24`、valid JSON `5`；full/workload/incremental三份singleton lock均进入fresh、validator、evidence与scan合同。
- Java start/readiness、三个pre-run gates与cleanup只使用resume-004 owner；resume-003只出现在Step 1历史/absence与Step 8 audit fences。唯一Java start executable是exact Maven launcher；execution fences无bare `mvn`、Maven wrapper、`brew` command、PATH fallback或placeholder。
- Diagnosis Review正文有两处明确self-hash禁令；其SHA只能在finalize后由外部tool result记录，不得预留、回写或自引用。
- Plan SHA在全部检查后仍为 `d532b0715f184a626b1f7e0888290f15ba7605f5d0f1eef5230fa05213215c23`，no-index whitespace check无错误。本plan与canonical Review在当前worktree均为既有untracked artifacts，故不存在可用的HEAD plan blob做relative-HEAD hunk比较；本轮以更新前/后SHA不变证明Preflight未修改plan，不把不可用的HEAD比较伪装为额外PASS。

## Task 6 resume-004 revision `d532b071` 最终建议

保持本计划revision与全部existing/fresh artifacts原状，但**不要执行** Exact Step 1之后的credential extraction for execution、resume-004 Java、三个variants、九个future observers、analyze或success audit。当前唯一安全结果是保留本轮Preflight `BLOCKED`：actual-host observer缺少numeric exit与sanitized clean row，不能由static/synthetic PASS补足。

不要修改当前observer、runId、basename、target counts、workload、duration、threshold、persistence或cleanup合同来规避本轮tool outcome；也不要retry、发起第五次resume、安装/relink/upgrade Maven、使用wrapper/PATH fallback、启动Java或claim evidence。任何后续继续都需要新的用户决定、计划revision与fresh independent strict Preflight。

## Task 6 resume-004 revision `d532b071` 后续门禁

- Preflight：`BLOCKED`；计划 SHA `d532b0715f184a626b1f7e0888290f15ba7605f5d0f1eef5230fa05213215c23` **不可执行**。
- OpenSpec：无需新增或修改；当前blocker是control-plane tool-result完整性，不改变runtime、threshold、workload、persistence或用户可见合同。Active change继续保持未归档。
- Superpowers：不得进入执行链；未来只有新的计划SHA取得fresh independent strict Preflight `PASS`，才可能按新授权继续。当前不创建repair implementation plan。
- 明确不授权：Java/profile/run/analyze、九个execution observers、正式Gate D、performance repair、修改plan/source/tests/OpenSpec/Dashboard、Git add/commit/push、OpenSpec archive、merge、tag、evidence/worktree cleanup或项目规则修改。
- Dashboard：不触发同步。
- 项目规则：未修改。

## Task 6 resume-003 revision `7e403266` 当前结论

通过：**Task 6 resume-003 strict Preflight PASS**。计划 SHA-256 `7e40326603d7a0a56d33d720cecab5a5125c8ab442f3d16bf930634f86989019` 与本轮输入绑定一致，且已针对当前 control-plane metadata（filesystem `unrestricted` / `danger-full-access`、approval policy `never`）完成全新 A–G 复核。

本轮 actual-host observer 的第一次且唯一一次调用直接使用 `exec_command`，省略 `sandbox_permissions` 与 `justification` 字段，执行完整 observer block并读取 host process table；numeric exit code 为 `0`，stdout 恰好为唯一 sanitized row：`observer=pre-run-clean runId=gate-r1-full-002 reason=clean role=none pid=0 ppid=0`。没有 ordinary sandbox、fallback、escalation、observer retry、异步修正或 external coordination。

本轮未启动 Java/profile/run/analyze，未 claim 或创建任何 resume-003 fresh target。受保护 attempt-002 database 只执行计划固定 `stat`，未 hash、open、query、copy 或触碰 sidecars。唯一写入是本 canonical Preflight Review；未修改计划、source、tests、OpenSpec、Dashboard、Git 或项目规则，也未执行正式 Gate D、repair、archive、merge、tag 或 cleanup。

## Task 6 resume-003 revision `7e403266` Review 范围

- [Resume-003 executable plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`7e40326603d7a0a56d33d720cecab5a5125c8ab442f3d16bf930634f86989019`
- [Canonical Preflight Review及全部既有轮次历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前 SHA-256：`724066c91c06e176143e99eb9c3a804d7f9cdb0fb1bc994488eee70fb146b295`
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Protected attempt-002 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：仅固定 `stat`
- [Credential declaration source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)：仅执行零输出 extraction selfcheck
- [Resume-003 final diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)：保持 fresh

## Task 6 resume-003 revision `7e403266` 主要发现

### Pass — A：Exact Step 1 prestate完整可达

- Exact Step 1 exit `0`：十份 historical evidence 均为 non-symlink mode `0600`，size与 SHA-256逐项匹配；十二份 resume-003 one-shot targets及 diagnosis Review均 absent/no-follow。
- Existing profile 固定结构断言通过；受保护 database tuple 为 `16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent，且只执行固定 `stat`。
- Initial disk gate 为 `available_kib=143092104`，高于固定 `12582912 KiB`；port `18084` 无 listener。process cleanliness没有从端口外推，而是由 E 的 actual-host observer独立证明。

### Pass — B/C：Credential与18个fences均机械通过

- Credential selfcheck numeric exit `0`、stdout `0` bytes；未输出 credential value、length或source line。
- Task 6 恰有十八个 bash fences；每个分别通过 `bash -n` 与 `zsh -n`，合计三十六次 syntax check全部通过。

### Pass — D/E：Control-plane envelope与actual-host observer闭合

- 九个 authorized observer envelopes 均精确绑定 `exec_command`，并逐行要求 `sandbox_permissions` omitted与 `justification` omitted。当前 Task 6 内 `require_escalated` 计数为零，正文只禁止 ordinary sandbox、fallback、escalation与retry，没有授权这些路径。
- 当前 control plane 与计划绑定一致：filesystem `unrestricted` / `danger-full-access`、approval policy `never`。
- 第一次且唯一一次 actual-host `pre-run-clean / gate-r1-full-002` 调用 numeric exit `0`，stdout只有预期 clean row且结构精确；未进行第二次 actual-host observer调用。

### Pass — F：Fresh 13-case no-file synthetic矩阵通过

- Pre/post clean均 exit `0`；pre/post process-present均 exit `41`；pre/post snapshot-failure均 exit `45`。
- Active coherent exact CLI → bridge → Runtime → MCP chain exit `0`。
- Active wrong ancestry、duplicate、current-missing与clean-timeout均 exit `41`；active snapshot failure exit `45`。
- Coherent selected chain加独立 foreign-run CLI exit `41`；输出同时含 current CLI PID `100` 与 foreign CLI PID `104` 的 sanitized `reason=process-present role=cli` rows，并通过禁词检查，不含 command、environment、path或secret text。
- Synthetic通过 shell-function snapshot injection直接运行计划 observer block，不创建文件、不读取真实process table，因此不构成第二次 actual-host observer。

### Pass — G：Counts、locks、命名、自哈希与revision scope一致

- Static counts精确为 historical `10`、fresh `12`、evidence `22`、scan `23`、valid JSON `5`。
- Full/workload/incremental三份 `.sqlite.lock` 均在fresh target、validator、evidence及scan合同内；新的Java owner只使用resume-003 log/PID basename，resume-001与resume-002 basename仅承担immutable history/audit角色。
- Diagnosis Review只作为第 `23` 个scan/hash document，不计入 `22` 份evidence；正文有两处明确自哈希禁令，禁止要求、预留或回写自身SHA，final SHA只能在文件完成后由外部tool result记录。
- Plan SHA在全部检查后仍为 `7e40326603d7a0a56d33d720cecab5a5125c8ab442f3d16bf930634f86989019`；targeted `git diff --check` exit `0`。工作树既有source/tests/evidence与未跟踪文档不属于本Preflight修改范围，均未触碰。

## Task 6 resume-003 revision `7e403266` 最终建议

授权同一计划 SHA 的既有 Task 6 resume-003执行链，且仅限：Exact Step 1 → credential selfcheck/extraction → fresh resume-003 Java owner/readiness → full-002、workload-001、incremental-001三个固定 `30m` variants严格串行执行及九个对应one-shot observers和各自validator → analyze → owned process cleanup → protected-input post-stat → diagnosis Review → `22/23/5` final audit。

执行中任何 metadata、freshness、credential、disk、listener、observer envelope/exit/structure、run、validator、analyze、ownership、cleanup、protected tuple或final audit mismatch都必须立即 `BLOCKED`，保留已消费artifact；不得retry、第四次resume、改runId/basename、缩短duration、改workload或清理evidence。

## Task 6 resume-003 revision `7e403266` 后续门禁

- Preflight：`PASS`；仅授权计划 SHA `7e40326603d7a0a56d33d720cecab5a5125c8ab442f3d16bf930634f86989019` 的上述既有链。计划内容或SHA变化必须重新独立strict Preflight。
- OpenSpec：无需新增或修改；active change继续保持未归档。本PASS不是Gate R1、formal Gate D、repair、archive、merge或发布授权。
- Superpowers：无需新实施计划；执行完成后仍须由独立strict High Review接受claim-to-mechanism chain，且只有decision=`confirmed`才可能使Gate R1 PASS。
- 明确不授权：另一次profile、正式Gate D、performance repair、修改plan/source/tests/OpenSpec/Dashboard、Git add/commit/push、OpenSpec archive、merge、tag、evidence/worktree cleanup或项目规则修改。
- Dashboard：不触发同步。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-003 revision `595dc562` tool-policy BLOCKED

## Task 6 resume-003 revision `595dc562` 当前结论

需修改：**Task 6 resume-003 strict Preflight BLOCKED**。计划 SHA-256 `595dc562b6479b297ffba4155a55e3445f652868096fc80699402c1151d1a17d` 已关闭历史 revision `17f38c118ef4608150aaafa7c630fffac6818833e91b57b08d73be952f463f91` 的 foreign-CLI High：observer 现在分别计数全部 fingerprinted `gate-r1-*` CLI 与当前 `RUN_ID` CLI，active success 要求两者都恰好为一且是同一 PID；fresh no-file synthetic 也证明 foreign CLI 会 exit `41` 并同时保留 current/foreign sanitized CLI candidates。

但本轮要求的 actual host `pre-run-clean / gate-r1-full-002` 首次且唯一一次调用被工具权限层在执行前拒绝。调用已直接使用 `exec_command`、`sandbox_permissions=require_escalated` 与精确 justification `Allow read-only host process-table inspection for Gate R1 pre-run-clean gate-r1-full-002?`，没有 ordinary-sandbox 试探、fallback 或 retry；工具没有运行 observer，因此没有 numeric exit code，也没有唯一 sanitized clean row。strict Preflight 的真实 host 门禁未满足，当前 revision 不能授权 Task 6。

本轮未启动 Java/profile/run/analyze，未 claim 或创建任何 resume-003 fresh target。受保护 attempt-002 database 只执行固定 `stat`，未 hash、open、query、copy 或触碰 sidecars。唯一写入是本 canonical Preflight Review；未修改计划、source、tests、OpenSpec、Dashboard、Git 或项目规则，也未执行正式 Gate D、repair、archive、merge、tag 或 cleanup。

## Task 6 resume-003 revision `595dc562` Review 范围

- [Resume-003 executable plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`595dc562b6479b297ffba4155a55e3445f652868096fc80699402c1151d1a17d`
- [Canonical Preflight Review及全部既有轮次历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前 SHA-256：`dbbed7b4b20e5331ab9b87d629bbe1e6f727063dbfe6c6019cc7144fbd5f8947`
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Protected attempt-002 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：仅固定 `stat`
- [Credential declaration source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)：仅执行零输出 extraction selfcheck
- [Resume-003 final diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)：保持 fresh

## Task 6 resume-003 revision `595dc562` 主要发现

### Blocking — actual host observer 未产生 strict Preflight 要求的 numeric clean result

- 本轮第一次且唯一一次 actual host observer 调用直接选择 `require_escalated`，justification 与 full-002 `pre-run-clean` 授权行逐字一致。
- 工具在 observer 命令执行前返回权限策略拒绝：当前 `UnlessTrusted` policy 不接受该 escalated 请求。该结果不含 observer numeric exit code或 stdout，不能等价为 `exit 0` / `reason=clean`。
- 按计划与本轮约束，没有转入 ordinary sandbox、fallback escalation、第二次 observer、异步修正或 external retry。因此这是当前 control-plane/tool permission blocker，不是 process-present、Java、Runtime、MCP、workload、database-oracle 或 performance 结论。
- Resume condition：在能够接受同一首次 `require_escalated` host process-table 调用的 control plane 中，对未变化的计划 revision 重新进行一次独立 strict Preflight；不得把本轮 synthetic PASS 代替 actual host evidence。

### Pass — 历史 foreign-CLI High 已被计划机制与 fresh synthetic 关闭

- Observer 同时维护 `all_cli_count` 与 `selected_cli_count`；active success 要求两者恰好为 `1` 且 `all_cli[1] == selected_cli[1]`。foreign-run CLI 不会再被 selected-run filtering 隐藏。
- Fresh no-file synthetic 共 `13` 个 cases：pre/post clean exit `0`，pre/post process-present exit `41`，pre/post snapshot-failure exit `45`；active coherent exact CLI → bridge → Runtime → MCP chain exit `0`。
- Active wrong ancestry、duplicate、current-missing、clean-timeout 与 coherent selected chain + foreign-run CLI 均 exit `41`；snapshot failure exit `45`。Foreign fixture 同时返回 current CLI PID `100` 与 foreign CLI PID `104` 的 sanitized `reason=process-present role=cli` rows，不含 command、environment、path 或 secret text。

### Pass — Exact prestate、credential、syntax 与 observer envelope 未漂移

- Exact Step 1 exit `0`：十份 historical evidence 的 non-symlink mode `0600`、size、SHA 全部匹配；十二份 resume-003 targets 与 diagnosis Review均 absent/no-follow。
- Existing profile 固定结构断言通过；受保护 database tuple 为 `16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent，仅 `stat`。
- Initial disk gate 返回 `available_kib=143462760`，高于固定 `12582912 KiB`；port `18084` 无 listener。完整 process-table clean 结论仍由上述被阻断的 actual host observer 掌管，不能从 port 结果外推。
- Credential selfcheck exit `0`、stdout `0` bytes；没有输出 credential value、length 或 source line。
- Task 6 共十八个 bash fences，全部通过 `bash -n` 与 `zsh -n`，合计三十六次 syntax check。
- 九个 authorized observer envelope 均精确绑定 `exec_command`、`sandbox_permissions=require_escalated` 与对应 kind/runId 的 read-only host-process-table justification；正文明确禁止 ordinary-sandbox first attempt、fallback、external retry、异步修正和等待 root。

### Pass — Target/audit 静态合同与 revision binding 一致

- Static counts 精确为 historical `10`、fresh `12`、evidence `22`、scan `23`、valid JSON `5`。
- Full/workload/incremental 三份 `.sqlite.lock` 均进入 fresh target、对应 validator、evidence 与 scan合同；resume-003 Java log/PID 名称只使用 `java-gateway-18084-resume-003.*`，resume-001/resume-002 basenames只承担 immutable history/audit角色。
- Diagnosis Review只作为第 `23` 个 scan/hash document，不计入 `22` 份 evidence；正文明确禁止要求、预留或回写自身 SHA，final SHA只能在文件完成后的外部 tool result/handoff中记录。
- Plan SHA 在所有检查后仍为 `595dc562b6479b297ffba4155a55e3445f652868096fc80699402c1151d1a17d`；targeted diff whitespace check exit `0`。工作树既有 source/tests/evidence与未跟踪文档不属于本 Preflight 修改范围，均未触碰。

## Task 6 resume-003 revision `595dc562` 最终建议

不要为本轮工具权限阻断修改当前计划、observer、runId、basename、target counts、workload、duration、threshold、persistence 或 cleanup合同。保留本轮 actual-host BLOCKED 记录，在具备所需 host read-only escalation能力的 control plane 中对同一计划 SHA 重新进行新的独立 strict Preflight；新轮次仍必须从 exact Step 1、credential零输出、syntax/envelope/synthetic 与首次且唯一 actual host observer完整复核，不能复用本轮 PASS项越过门禁。

只有未来 strict Preflight 完整 PASS，才可授权计划中既有的三个固定 `30m` variants完整链：fresh Java owner/readiness → full/workload/incremental 严格串行 runs及各自 pre/active/post observer和 isolated validator → analyze → owned cleanup → protected post-stat → diagnosis Review与 `22/23/5` final audit。任何 mismatch立即 `BLOCKED`，不授权 retry或第四次 resume。

## Task 6 resume-003 revision `595dc562` 后续门禁

- Preflight：`BLOCKED`；当前 SHA 不授权 credential extraction for execution、Java/profile/run/analyze、fresh target claim或 Task 6实施。
- OpenSpec：无需新增；当前 blocker是 control-plane host observation permission，未改变 runtime、threshold、workload、persistence或用户可见合同。Active change继续保持未归档。
- Superpowers：无需新实施计划；现有计划必须先取得新的独立 strict Preflight `PASS`。未来 PASS也只授权上述三个固定 `30m` variants既有链。
- 明确不授权：profile、正式 Gate D、performance repair、Git add/commit/push、OpenSpec archive、merge、tag、evidence/worktree cleanup或项目规则修改。
- Dashboard：不触发同步。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-003 revision `17f38c11` BLOCKED

## Task 6 resume-003 revision `17f38c11` 当前结论

需修改：**Task 6 resume-003 strict Preflight BLOCKED**。revision `17f38c118ef4608150aaafa7c630fffac6818833e91b57b08d73be952f463f91` 已把每个 observer stage 的第一次且唯一一次 host process-table 调用固定为 `sandbox_permissions=require_escalated`，列出九个窄化 justification，并把 `clean`、`process-present`、`snapshot-failure` 的输出与 exit matrix 分开；当前 host 的首个 full-002 `pre-run-clean` 也确实在没有 ordinary-sandbox 试探或 fallback 的前提下返回 numeric exit `0` 与唯一 sanitized clean row。

但 fresh synthetic active matrix 暴露一项 High：`active-chain` 只把与所选 `RUN_ID` 匹配的 CLI 计入 `cli_count`，成功路径却没有拒绝同时存在的另一个 `gate-r1-*` CLI。机械用例“完整 full-002 CLI → bridge → Runtime → MCP 链 + 独立 workload-001 CLI”错误返回 exit `0`，并从输出中省略 workload CLI。这违反同一计划明确要求的“exactly one CLI”、串行不重叠和无歧义 owned-chain 证明，因此当前 revision 不能授权 Java、三个 variants 或 analyze。

本轮未启动 Java/profile/run/analyze，未 claim 或创建任何 resume-003 fresh target；唯一写入是本 canonical Preflight Review。受保护 attempt-002 database 只执行固定 `stat`，未 hash、open、query、copy 或触碰 sidecars。未修改计划、source、tests、OpenSpec、Dashboard、Git、项目规则，也未执行 Gate D、归档、合并、tag 或 cleanup。

## Task 6 resume-003 revision `17f38c11` Review 范围

- [Resume-003 executable plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`17f38c118ef4608150aaafa7c630fffac6818833e91b57b08d73be952f463f91`
- [Canonical Preflight Review及全部既有轮次历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前 SHA-256：`32690cfb304ed652908e51ccdee50078e5e905205c8aca3fcc2f01a7eb2613c5`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Diagnostic runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Runtime child boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Protected attempt-002 database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：仅固定 `stat`
- [Resume-003 final diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

## Task 6 resume-003 revision `17f38c11` 主要发现

### High — Active observer 会把第二个 Gate R1 CLI 隐藏并错误接受为唯一 owned chain

observer parser 对所有包含 split fingerprint `gateDPerformanceDiagnostic` + `Cli` 且含 `gate-r1-` 的进程设置 `candidate_role[pid] = "cli"` 和 `any_task6 = 1`，但只有命令文本还包含当前 `run_id` 时才执行 `cli[++cli_count] = pid`。成功判定仅检查 `cli_count == 1`、全局 Runtime count 和 MCP ancestry；构造成功 rows 时也只从当前 CLI root 建立 `role`，不会输出另一个 variant 的 CLI candidate。

Fresh no-file synthetic 结果如下：

- full-002 当前链：CLI PID `100` → bridge `101` → Runtime `102` → MCP `103`；
- 同一 snapshot 额外加入 workload-001 CLI PID `104`；
- 实际结果：numeric exit `0`，只输出 PID `100/101/102/103` 的 sanitized rows，PID `104` 完全消失；
- 预期结果：numeric exit `41`，以 sanitized `reason=process-present role=cli` candidates 证明 ambiguous/incoherent state。

这不是单纯输出完整性问题。执行 Agent会把 exit `0` 当作当前 variant 的唯一 active chain 所有权证明，随后允许 run 继续；而计划正文又要求 variants 严格串行、active exit `0` 恰好一个 CLI，且 cleanup 只依赖成功 active-chain 结果。当前实现无法证明没有另一个 Gate R1 CLI 并存，故不能安全授权执行。

最小修订：同时维护“所有 fingerprinted `gate-r1-*` CLI 数量”和“selected `RUN_ID` CLI 数量”；active success 必须要求两者均恰好为 `1` 且为同一 PID。若存在 foreign-run CLI，必须走 sanitized ambiguous/process-present exit `41`，不得在 success rows 中隐藏。修订后的 fresh Preflight 必须新增该 foreign-CLI negative fixture，并继续验证 current coherent chain exit `0`、wrong ancestry/duplicate/current-missing/clean timeout exit `41`、snapshot acquisition failure exit `45`。

### Pass — Resume-003 immutable/fresh/protected/resource prestate 未漂移

- Exact Step 1 exit `0`：十份 historical evidence 的 non-symlink mode `0600`、size、SHA 全部匹配；十二份 resume-003 targets 与 diagnosis Review均 absent/no-follow。
- Existing profile 的固定结构断言通过；受保护 database tuple 仍为 `16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent，仅 `stat`。
- Initial disk gate 返回 `available_kib=174397028`，高于固定 `12582912 KiB`；port `18084` clean。
- Credential selfcheck exit `0`、stdout 零字节；没有输出 credential 值、长度或源行。

### Pass — Fresh-shell、observer envelope 与其余 synthetic matrix 通过

- Task 6 共十八个 bash fences，全部通过 `bash -n` 与 `zsh -n`，合计三十六次 syntax check。
- 九个 authorized observer envelope 全部逐项绑定 `exec_command`、`sandbox_permissions=require_escalated` 和对应 kind/runId 的窄化 read-only host-process-table justification；正文明确禁止 ordinary-sandbox first attempt、fallback escalation、external retry、异步修正和等待 root。
- 本轮第一次 actual host observer 直接按 full-002 `pre-run-clean` envelope 请求 escalated read-only process table；numeric exit `0`，stdout 严格为一行 `reason=clean role=none pid=0 ppid=0`。
- No-file synthetic：pre/post clean exit `0`；pre/post process-present exit `41`；pre/post snapshot-failure exit `45`；active coherent exact CLI/bridge/Runtime/MCP exit `0`；wrong-ancestry active incoherent exit `41`；active clean timeout exit `41`；active snapshot-failure exit `45`。除上述 foreign-CLI finding 外，reason/role/exit schema 一致。
- Final audit 的静态合同仍为 historical `10` + fresh `12` = evidence `22`，scan targets `23`，valid JSON targets `5`；zero-byte historical full-001 report不作 JSON parse，diagnosis Review自身 SHA 只在外部记录。

## Task 6 resume-003 revision `17f38c11` 最终建议

只修订 active observer 的全局 CLI 唯一性判定与对应 synthetic negative fixture。不要改变十份 historical bindings、十二份 fresh targets、`22/23/5` audit counts、runId、variants、三十分钟/三十秒/六十 samples、workload、threshold、persistence、credential、Java ownership、protected-input 或 cleanup 边界。

计划修改后必须生成新 SHA 并重新进行独立 strict Preflight。当前 revision 的 prestate/syntax/envelope PASS 不能越过本 High；不得临场过滤 foreign CLI、重试 observer、改 runId/basename、启动 Java 或 claim evidence。

## Task 6 resume-003 revision `17f38c11` 后续门禁

- Preflight：`BLOCKED`；当前 SHA 不授权 Java/profile/run/analyze 或任何 fresh target claim。
- OpenSpec：无需新增；这是只读 diagnostic observer 的 ownership-proof 修正，不改变 threshold、workload、持久化语义或用户可见行为。若选择改变这些固定语义则需新 proposal。
- Superpowers：修订同一执行计划后重新独立 strict Preflight；只有后续 execution 完整完成、decision=`confirmed` 且独立 strict High Review接受 claim-to-mechanism chain，Gate R1 才可 PASS。
- Dashboard：不触发同步。
- Git/发布：不授权 add/commit/push、正式 Gate D、archive、merge、tag、evidence/worktree cleanup 或 performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-002 revision `6d3025c6` 第五轮 PASS

## Task 6 resume-002 revision `6d3025c6` 当前结论

通过：**Task 6 resume-002 第五轮 Preflight PASS**。revision `6d3025c635901ac6f680c1d971edc6384ba7f4b3933b5d66c709df83807d85aa` 已关闭第四轮唯一High：Gate R1 diagnosis Review正文只记录20份evidence的mode/SHA，不要求、预留或回写自身SHA；Review完全finalize并通过secret/path/mode scan后，final `shasum` tool result才计算其SHA，由执行Agent在外部handoff与最终用户回复记录。该顺序无自引用，且没有新增detached artifact或改变12/20/21/JSON5合同。

本轮未发现actionable finding。当前host prestate、八份immutable bindings、12个fresh targets、diagnosis fresh、protected-input stat-only tuple/sidecars、disk、credential、port/process、18个fresh-shell fences、全链session scope、三个isolated validators、observer host/synthetic、真实argv/ancestry、三份Runtime locks、exact60-sample报告验收、analyze、owned cleanup、protected post-stat与final audit均机械或静态PASS。

本PASS仅授权执行Agent严格按上述SHA执行Task 6 resume-002：Step 1完整prestate → Step 2 nonprinting credential selfcheck → Step 3 fresh Java owner/readiness → Step 4每run内建Java/MCP gate → full/workload/incremental三个固定串行30分钟runs及各自pre/active/post observer和isolated validator → analyze → owned cleanup → protected fixed-tuple post-stat → final diagnosis Review → 20 evidence/21 scan final audit并外部记录Review SHA。任何prestate、SHA、fresh target、listener、observer、sample、lock、mode、secret、cleanup或tool-result mismatch立即使本PASS失效并返回`BLOCKED`。

本PASS不授权重新profile、formal Gate D、performance repair、retry/third resume、新basename/runId、缩短或改变workload/threshold/persistence、复用历史PID、Git add/commit/push、Dashboard、OpenSpec archive、merge、tag、evidence/worktree cleanup或项目规则修改。

本轮未启动Java/profile/run/analyze，未claim或创建fresh target；唯一写入是本canonical Preflight Review。

## Task 6 resume-002 revision `6d3025c6` Review 范围

- [Resume-002 executable plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`6d3025c635901ac6f680c1d971edc6384ba7f4b3933b5d66c709df83807d85aa`
- [Canonical Preflight Review及前四轮历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前SHA-256：`af8d59a0d472104a45ae4681897305930bdeacbb8875e632c3349302a6e526eb`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Diagnostic runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Runtime child spawn boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Runtime storage lock wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [Descriptor-owned singleton lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts)
- [Java authentication boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Final Gate R1 diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

受保护 [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 仅执行固定`stat`；未hash、open、query、copy、move、write、chmod或触碰sidecars。

## Task 6 resume-002 revision `6d3025c6` 主要发现

### Pass — Final diagnosis Review自哈希High已关闭

Step 8现在明确区分两类hash：

- diagnosis Review正文记录20份evidence的mode/SHA，历史8份必须等于immutable bindings；
- diagnosis Review完成后，final audit把其作为额外第21个scan target和`shasum`最后一个输入，control plane从final tool result读取Review SHA，仅在外部handoff与最终用户回复记录，明确禁止写回Review。

因此Review内容先finalize，generic/actual-token/path/mode scans再验证，最终hash随后计算且不再修改文件。没有placeholder、自引用、回填或未授权checksum artifact。

### Pass — Sidecar 12/20/21/JSON5合同与production mechanism一致

- Fresh targets exact12：三个database、三个report、三个`.sqlite.lock`、decision、resume Java log/PID。Step 1当前全部absent/no-follow，diagnosis Review absent。
- 三个per-run pre gates和run payload只检查对应database/report/lock；三个validators只读取对应run，分别验证database/report及lock non-symlink regular mode`0600`，不触及future report。
- Production Runtime对每个variant都start，storage对每个SQLite `O_CREAT` `${path}.lock` mode`0600`且release只close；full/workload/incremental lock均被计划接受并在failure时preserve。
- Final evidence exact20：historical8 + full3 + resume Java2 + workload3 + incremental3 + decision1；SCAN exact21（再加diagnosis Review）；JSON exact5，仅profile/三个valid reports/decision，zero-byte full-001 report不parse。
- 所有20 evidence与Review进入generic secret和actual reviewed-token scan、type/mode检查及final SHA输出；五个JSON额外做root-path与forbidden raw-output scan。

### Pass — 全链fresh-shell/session scope与fixed run/analyze/cleanup合同闭合

- 18个Task 6 bash fences均通过`bash -n`与`zsh -n`；逐block复核没有依赖不存在的shell变量或function。Step 1、credential、Java start/readiness、三个per-run gates、三个run、三个validators、analyze、cleanup、post-stat和audit均重建完整paths/functions；active diagnostic与Java只通过retained control-plane session id操作。
- Step 1 exact exec exit`0`，输出仅sanitized fixed tuple和`disk_gate=pass available_kib=173918316`，无路径；八份immutable type/mode/size/SHA与profile结构全部匹配。
- Credential selfcheck exit`0`、stdout零字节；三个run各自以`set +x`和private subshell提取raw credential，CLI添加唯一Bearer，退出即unset，不进入argv/file/output。
- 三个runs固定full → workload → incremental，30分钟、30秒interval、exact60 sequential samples、zero report/sample hard failures；probe signatures分别为7、0、1，runId/variant/database basename完整绑定。
- Analyze在同一self-contained block内先hash三reports、fresh-check decision、执行后复核report SHA不变，再验证decision mode/result/status closed enums。
- Cleanup先操作retained sessions，再只依据resume PID file、same numeric listener、main-class和port fingerprint执行TERM/KILL fallback；最后要求port free且Task 6 Runtime/MCP zero orphan。protected post-stat直接比较fixed tuple，不跨shell依赖。

### Pass — Observer protocol、host prestate与synthetic/argv证据通过

observer每stage单一tool invocation/单一final result；pre单sample，active最多240×250ms bounded readiness，post同bound settle；无intermediate stdout、文件写入或process env读取。control plane必须验证numeric exit和strict sanitized schema/ancestry。

Current host三条pre-run-clean分别对三个runId返回numeric exit`0`与exact `role=none pid=0 ppid=0`，observer无self-match。No-file synthetic：coherent exit`0`返回CLI/bridge/Runtime/MCP；startup-late silent wait后exit`0`；post-settle exit`0`返回none；timeout只返回blocked line并exit`41`。

真实Runtime argv为`node --import tsx <formalSoakRuntimeChild.ts>`，SQLite/MCP/token在env；observer不依赖env-only runId/path，而是以unique runId CLI为root并用PPID ancestry绑定fingerprinted Runtime与所有qualification MCP descendants。

### Pass — Current immutable/protected/resource与历史边界未漂移

- 八份immutable evidence均为non-symlink mode`0600`，size/SHA精确匹配；partial full-001不作性能推断。
- protected tuple为`16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent，仅stat；port`18084`及Task 6 process prestate clean。
- 无stale resume-001 execution target；旧profile/log/PID/full-001 artifacts只出现在immutable verification、history与final audit。
- No retry、no third resume、consumed partial preservation、disk threshold`12582912 KiB`、isolated Java ownership与stop/cleanup合同完整。

## Task 6 resume-002 revision `6d3025c6` 最终建议

接受revision `6d3025c635901ac6f680c1d971edc6384ba7f4b3933b5d66c709df83807d85aa`作为唯一可执行Task 6 resume-002计划。执行必须从Step 1重新完整复核current prestate，严格串行且无retry；任何计划SHA、immutable binding、fresh target、protected tuple、disk、listener、credential、observer、sample、sidecar、mode、secret或cleanup变化立即使本PASS失效并返回`BLOCKED`，不得临场修订。

## Task 6 resume-002 revision `6d3025c6` 后续门禁

- Preflight：`PASS`；仅授权上述SHA及本Review列出的Task 6 resume-002完整执行链。
- OpenSpec：无需新增；active change继续未归档。threshold、workload、持久化语义、部署或用户可见合同变化仍需新proposal。
- Superpowers：execution完成后必须产出Gate R1 diagnosis Review；只有decision=`confirmed`且独立strict High Review接受claim-to-mechanism chain，Gate R1才可PASS。`inconclusive`是真实完成结果但不授权选择repair。
- Dashboard：不触发同步。
- Git/发布：未授权add/commit/push/archive/merge/tag、正式Gate D、evidence/worktree cleanup或performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-002 revision `ddf2fe90` 第四轮 BLOCKED

## Task 6 resume-002 revision `ddf2fe90` 当前结论

需修改：**Task 6 resume-002 第四轮 Preflight BLOCKED**。revision `ddf2fe906a0a5a00b82e891f9f153db0dab72569a4bd11df5b38805bcc6d6fa6` 已按用户明确授权关闭第三轮sidecar High：workload/incremental singleton lock均纳入12个fresh targets、各自pre-run/run fresh no-follow gate、对应validator的non-symlink regular mode-`0600`检查、failure preservation、20-evidence/21-scan mode/secret/SHA audit；JSON targets仍exact 5，zero-byte historical full-001 report不作JSON parse。全链session-scope、observer、60-sample、analyze、cleanup和protected stat-only合同也未回归。

但Step 8仍有一项确定性High：它要求最终Gate R1 diagnosis Review本体“include ... the diagnosis Review SHA-256”，同时规定“After the Review is written”才执行`shasum ... "$DIAGNOSIS_REVIEW"`。一个普通文件无法稳定包含自身最终SHA-256：写完后计算得到hash，再把该hash写回Review会改变文件内容并产生新的hash；当前计划也没有授权detached checksum/manifest target或规定由外部artifact记录该hash。因此final Review无法同时满足“本体包含自身最终SHA”与“审计得到最终SHA”，strict Preflight只能`BLOCKED`。

本轮机械通过项：plan SHA精确匹配；exact Step 1验证八份immutable bindings、12个fresh targets、diagnosis fresh、protected fixed tuple/WAL/SHM、port与disk（`available_kib=173974600`）并exit`0`；credential selfcheck exit`0`且stdout零字节；18个Task 6 fences均通过fresh-shell`bash -n`与`zsh -n`；三个host pre observers均numeric exit`0`和exact none；synthetic coherent/startup-late/post-settle均exit`0`，timeout只返回blocked并exit`41`；array count机械为20 evidence、21 scan、5 JSON。发现actionable finding后停止，没有启动或claim任何Task 6 target。

本轮唯一写入是本canonical Preflight Review；未修改计划、source、tests、OpenSpec、Dashboard、Git状态或项目规则。

## Task 6 resume-002 revision `ddf2fe90` Review 范围

- [Resume-002 revised plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`ddf2fe906a0a5a00b82e891f9f153db0dab72569a4bd11df5b38805bcc6d6fa6`
- [Canonical Preflight Review及前三轮历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前SHA-256：`61c49104260e50185d2e8427541a389e93a731d0f34ccc297929cea203002298`
- [Diagnostic final Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)
- [Runtime storage lock wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [Descriptor-owned singleton lock implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts)
- [Diagnostic runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Runtime child spawn boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)

受保护 [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 仅执行固定`stat`；未hash、open、query、copy、move、write、chmod或触碰sidecars。

## Task 6 resume-002 revision `ddf2fe90` 主要发现

### High — Final diagnosis Review被要求包含自身最终SHA，形成不可满足的自引用

Step 8的Review必填列表明确要求“mode and SHA-256 for every one of the 20 evidence files, plus the diagnosis Review SHA-256”。同一步随后先要求写Review，再把`$DIAGNOSIS_REVIEW`作为`shasum -a 256`最后一个输入。若执行顺序为：

1. 写Review但暂不写自身SHA；
2. 计算hash `H1`；
3. 把`H1`写入Review以满足必填字段；

则第3步修改了Review，最终hash变为`H2`，Review记录的`H1`已失效。重复该过程不能构成可审计的有限完成协议。预留空格、占位符或写入前hash同样不是“diagnosis Review最终SHA-256”。

最小修订：从diagnosis Review本体必填字段中删除“自身SHA”，仍在final audit tool result和执行Agent最终回复中记录其final SHA；或明确新增独立detached checksum/manifest artifact，在Review finalization后写入且把该artifact纳入新的fresh/audit合同。推荐前者，不增加target/count，也不改变20 evidence/21 scan。修订计划SHA后必须重新strict Preflight。

### Pass — 第三轮两份Runtime lock High已按用户授权完整关闭

- Fresh contract明确列出full/workload/incremental三份`.sqlite.lock`，总计12个fresh targets；Step 1对全部12项执行absence/no-follow。
- 三个per-run pre gates和三个self-contained run payload分别检查该variant database/report/lock fresh；没有later-target交叉访问。
- 三个per-run validators分别只验证对应database/report及对应lock为non-symlink regular mode`0600`；failure wording明确所有已claim/created lock均consumed并保留。
- Final audit把historical 8 + full 3 + resume Java 2 + workload 3 + incremental 3 + decision 1计为exact20 evidence；diagnosis Review仅作为额外scan/hash文档，SCAN targets exact21，JSON targets exact5。两份新lock进入generic secret、actual token、mode、type和SHA scan；zero-byte full-001 report不进入JSON parse。
- Production mechanism一致：三个variants都start Runtime，storage对每个SQLite创建`${path}.lock` mode`0600`且release不unlink；计划现在完整接受该lifecycle，不要求清理sidecars。

### Pass — 全链self-contained、observer与运行验收无回归

- 18个bash fences均在fresh worktree通过`bash -n`和`zsh -n`。Step 1、credential、Java start/readiness、三个per-run gates、三个run、三个isolated validators、analyze/decision、cleanup、protected post-stat及final audit均自包含；retained diagnostic/Java sessions仅由control-plane session id操作。
- Disk gates只输出sanitized `available_kib`，不输出路径；initial exact result为`173974600`，高于`12582912`。
- observer保持single invocation/single final result、bounded active readiness/post settle、无intermediate stdout/file/env read。host三个pre rows均exit`0`+exact none；四类synthetic结果符合合同。
- Runtime真实argv为`node --import tsx <formalSoakRuntimeChild.ts>`，observer通过unique runId CLI与PPID ancestry绑定Runtime/MCP，不读取env-only runId/path，也不self-match。
- 每个report validator绑定duration`1800000`、interval`30000`、exact60 sequential samples、zero hard failures及variant-specific probe signature；analyze fresh-decision/no-overwrite、report pre/post SHA与closed result/status enums明确。
- Cleanup只操作retained sessions和mode-`0600` resume PID记录所证明的same listener/main-class/port fingerprint；protected post-stat直接比较fixed tuple，final audit不依赖跨shell变量。

### Pass — Current immutable/fresh/protected/resource/credential bindings未漂移

- 八份immutable evidence为non-symlink mode`0600`且size/SHA逐一匹配；现有partial full-001未用于性能结论。
- 12个resume-002 targets与diagnosis Review均absent；performance-recovery/Gate R1仍为non-symlink mode`0700`。
- protected tuple仍为`16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent，只做`stat`。
- port`18084`与Task 6 process prestate clean；credential selfcheck POSIX BRE、exit`0`、stdout零字节，run wrapper不产生double Bearer。
- 未发现stale resume-001 basenames被作为execution targets；它们仅保留在immutable verification、history和final audit中。

## Task 6 resume-002 revision `ddf2fe90` 最终建议

只修订final diagnosis Review的hash记录位置：20份evidence的mode/SHA仍写入Review；diagnosis Review自身final SHA在文件finalize后由audit tool result和执行Agent最终回复记录，不要求写回本体。不要改变12 fresh、20 evidence、21 scan、5 JSON、runId、variants、30分钟/30秒/60 samples、workload、threshold、persistence、credential、observer、protected-input或cleanup边界。计划SHA变化后重新独立strict Preflight；PASS前不得启动Java或claim resume-002 evidence。

## Task 6 resume-002 revision `ddf2fe90` 后续门禁

- Preflight：`BLOCKED`；当前revision不授权Java/profile/run/analyze或任何fresh target claim。
- OpenSpec：无需新增；这是diagnostic Review证据记录协议修正，不改变运行时、threshold、workload或持久化语义。若新增detached artifact则仍需明确用户授权与target/audit更新，但无需改变现有OpenSpec语义。
- Superpowers：修订同一计划后重新strict Preflight；实际execution后仍需独立strict High Review。
- Dashboard：不触发同步。
- Git/发布：未授权add/commit/push/archive/merge/tag、正式Gate D、evidence/worktree cleanup或performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-002 revision `1f4a39cb` 第三轮 BLOCKED

## Task 6 resume-002 revision `1f4a39cb` 当前结论

需修改：**Task 6 resume-002 第三轮 Preflight BLOCKED**。revision `1f4a39cb4d9d60e8305508410d1782c3988fa1c318680daacc8be8e3837e8268` 已关闭第二轮全链session-scope High：Task 6全部18个bash fences均可由fresh worktree zsh/bash解析；Step 1、credential、Java start/readiness、三个per-run disk/Java/fresh gates、三个run、三个only-corresponding validators、analyze/decision validation、cleanup、protected fixed-tuple post-stat与final 18-evidence/19-scan audit都在各自block重建所需paths/functions，或明确使用control-plane retained session id。

但真实production wiring复核发现新的确定性High：每个variant都会启动Runtime child并调用`openProductionRuntimeStorage(sqlitePath)`；该函数对每个SQLite无条件`O_CREAT`创建`${sqlitePath}.lock`，release只close descriptor、不unlink文件。因此workload-only和incremental-oracle除计划列出的database/report外，还必然分别留下`gate-r1-workload-001.sqlite.lock`与`gate-r1-incremental-001.sqlite.lock`。当前计划却声明“Create only these ten fresh targets”，pre-run只检查两个lock以外的database/report，validators不验证其lock，final audit固定exact 18 evidence且完全遗漏两份lock。按计划执行会创建未授权、未绑定、未扫描、未hash的证据文件，strict Preflight只能`BLOCKED`。

本轮机械通过项：plan SHA精确匹配；18个fences在fresh shell下`bash -n`与`zsh -n`全部PASS；exact Step 1 exit`0`并输出sanitized protected tuple与disk result（`available_kib=174068872`）；credential selfcheck exit`0`且stdout零字节；三个current-host pre-run observer均numeric exit`0`和exact `role=none`；current observer synthetic coherent、startup-late与post-settle均exit`0`，timeout仅输出sanitized blocked line并exit`41`。八份immutable bindings、十个声明中的fresh targets、diagnosis target、protected stat-only tuple/sidecars、port/process clean均未漂移。这些PASS不能覆盖未授权lock finding。

发现actionable finding后停止；未启动Java/profile/run/analyze，未claim或创建fresh target。唯一写入是本canonical Preflight Review；未修改计划、source、tests、OpenSpec、Dashboard、Git状态或项目规则。

## Task 6 resume-002 revision `1f4a39cb` Review 范围

- [Resume-002 revised plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`1f4a39cb4d9d60e8305508410d1782c3988fa1c318680daacc8be8e3837e8268`
- [Canonical Preflight Review及前两轮历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前SHA-256：`046c8f83a1f0d4a2879e60ae7f8ee60ee58e537fb8febb514b6bc38deff9223a`
- [Runtime storage lock wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [Descriptor-owned singleton lock implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts)
- [Diagnostic runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Runtime child spawn boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)

受保护 [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 仅执行固定`stat`；未hash、open、query、copy、move、write、chmod或触碰sidecars。

## Task 6 resume-002 revision `1f4a39cb` 主要发现

### High — Workload与incremental Runtime必然创建两份计划未授权、未审计的lock文件

[Diagnostic runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts) 对`full-oracle`、`workload-only`和`incremental-oracle`统一先执行`startRuntime({ sqlitePath })`；variant只改变database oracle cursor/probe，不跳过Runtime。real boundary把每个variant自己的`sqlitePath`传给 [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)。

[runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts) 的`openProductionRuntimeStorage(path)`在打开database前调用`acquireRuntimeSingletonLock(`${path}.lock`)`。[singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts) 在Darwin/Linux都使用`O_CREAT`、mode`0600`；`release()`仅`closeSync(fd)`，没有unlink。因此三条run的lock lifecycle完全相同，不存在“仅full产生lock”的机制。

当前计划只包含并处理：

- `gate-r1-full-002.sqlite.lock`：列入fresh targets、full pre-run、full validator和18-evidence audit；
- `gate-r1-workload-001.sqlite.lock`：未列入任何target、fresh check、validator、scan或hash；
- `gate-r1-incremental-001.sqlite.lock`：未列入任何target、fresh check、validator、scan或hash。

执行workload/incremental会直接违反“Create only these ten fresh one-shot evidence targets”和“audit exactly 18 evidence files”。执行Agent不能忽略、删除或临场加入这两个files：忽略会留下未审计证据，删除违反no-cleanup/consumed-evidence合同，临场加入则改变当前revision的immutable target与audit计数。

最小修订：把两份lock明确加入fresh one-shot targets、各自pre-run absence gate、post-run validator、mode/secret/SHA scan与最终evidence count；总fresh targets应从10调整为12，最终evidence从18调整为20，scan targets从19调整为21。所有历史八份bindings保持不变。计划SHA变化后重新strict Preflight，并机械确认三条variant lock expectations与production storage机制一致。

### Pass — 第二轮全链session-scope High已关闭

- Step 1是单一self-contained exec，直接输出fixed protected tuple和available KiB；Step 8重新与fixed tuple比较，不依赖跨shell`INPUT_IDENTITY_PRE`。
- Java start和readiness分别重建paths；readiness只在fresh PID target上记录unique listener PID/fingerprint。
- 三个per-run gates分别重建disk、PID、listener、command与该variant fresh targets，并只输出`available_kib`，不输出路径。
- 三个run分别自包含raw-token wrapper和完整CLI flags；token不进入argv/output/file。三个validators各自定义function，只触及对应run；full额外验证full lock，不再触及future reports。
- analyze、decision validation、cleanup、protected post-stat及final audit均自包含。final arrays机械固定18 evidence和19 scan entries；其计数本身正确，但成员遗漏两份真实Runtime locks，属于上述High。
- 18个Task 6 bash fences全部通过fresh-shell`bash -n`与`zsh -n`；未发现stale resume-001 execution target被复用，历史names仅用于immutable verification/audit。

### Pass — Observer protocol、synthetic与真实argv fingerprint机械通过

observer每stage保持one command/one tool result；active内部bounded readiness，post内部bounded settle，无intermediate stdout、文件写入或process env读取。四类no-file synthetic结果：coherent exit`0`并返回exact CLI/bridge/Runtime/MCP；startup-late在silent wait后同样exit`0`；post-settle在orphan消失后exit`0`并返回none；timeout只返回一个blocked line并exit`41`。

真实Runtime argv为`node --import tsx <formalSoakRuntimeChild.ts>`，runId/SQLite/MCP/token在env；observer以unique含runId的CLI argv作为root，再用PPID ancestry绑定fingerprinted Runtime与qualification MCP，不依赖env-only字段。当前host三个pre rows均exit`0`，各自只返回exact`role=none pid=0 ppid=0`，observer无self-match。

### Pass — Current immutable/fresh/protected/resource/credential bindings未漂移

- 八份immutable evidence仍为non-symlink mode`0600`，size与SHA逐一匹配；现有partial full-001未用于性能结论。
- 当前计划声明的十个resume-002 targets与diagnosis Review均absent；新增finding中的两份workload/incremental lock targets当前也absent，但尚未获计划授权。
- protected tuple仍为`16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent，只做`stat`。
- exact Step 1 disk parser返回纯数字`174068872`并高于`12582912`，输出不含路径；port`18084`和Task 6 process prestate clean。
- credential selfcheck使用POSIX BRE，exit`0`、stdout零字节；run wrapper同表达式、`set +x`、subshell export/unset，不产生double Bearer。
- report validators仍绑定fixed 30分钟、30秒、exact60 samples、连续sample indices、zero hard failures和variant probe signatures；该验收没有因lock finding改变。

## Task 6 resume-002 revision `1f4a39cb` 最终建议

仅修订artifact set与对应机械audit：加入workload/incremental两份Runtime singleton lock，不改变runId、variants、30分钟/30秒/60 samples、workload、threshold、persistence implementation、credential、observer、protected-input或cleanup边界。更新fresh/evidence/scan计数和所有对应gates后重新独立strict Preflight；PASS前不得启动Java或claim resume-002 evidence。

## Task 6 resume-002 revision `1f4a39cb` 后续门禁

- Preflight：`BLOCKED`；当前revision不授权Java/profile/run/analyze或任何fresh target claim。
- OpenSpec：无需新增；这是使diagnostic evidence contract与既有production lock机制一致的计划修正，不改变持久化语义。若选择改变lock创建/保留语义则需新OpenSpec。
- Superpowers：修订同一计划后重新strict Preflight；实际execution后仍需独立strict High Review。
- Dashboard：不触发同步。
- Git/发布：未授权add/commit/push/archive/merge/tag、正式Gate D、evidence/worktree cleanup或performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-002 revision `623abaa9` 第二轮 BLOCKED

## Task 6 resume-002 revision `623abaa9` 当前结论

需修改：**Task 6 resume-002 第二轮 Preflight BLOCKED**。revision `623abaa9db8b9e1fd65934a76b0e28e0fbd5e4bd65ab7f149e81f6baf1ef8c11` 已实质关闭上一轮两项局部 High：三个正式 run exec payload各自重建全部路径、fresh checks和nonprinting raw-token wrapper；observer也改为每stage单一control-plane invocation、单一最终result，active内部bounded readiness、post内部bounded settle，真实Runtime argv fingerprint仍通过unique runId CLI + PPID ancestry绑定，不依赖env-only runId/path。

但全链 session-scope审查发现新的 High：Java readiness/binding、每variant disk与Java identity gate、对应post-run validator/full-lock check、analyze、protected post-stat及final 18-evidence audit都继续引用仅在其他shell block定义的变量或function；计划没有把这些block绑定为同一持续session，也没有给出各独立tool exec完整自包含payload。尤其validator一方面给出包含三次调用的combined block，另一方面要求每run“invoke only the corresponding validator”，却没有在该独立调用中重新定义function和对应paths。按当前exact命令执行会出现空变量、command/function missing，或首个run后错误校验尚未生成的后续reports。strict Preflight对任一不存在shell状态依赖只能返回`BLOCKED`。

当前prestate机械PASS：plan SHA精确匹配；八份immutable evidence的type/mode/size/SHA全部匹配；十个resume-002 targets和diagnosis Review仍fresh；protected main仅`stat`且fixed tuple/sidecars匹配；available=`174385136 KiB`；port`18084` clean；POSIX credential selfcheck exit `0`且零输出；三个当前exact pre-run observer均numeric exit `0`并只返回对应`role=none`行。发现上述actionable High后按授权停止扩展，没有启动Java/profile/run/analyze或claim fresh target。

本轮唯一写入是本canonical Preflight Review；未修改计划、source、tests、OpenSpec、Dashboard、Git状态或项目规则。

## Task 6 resume-002 revision `623abaa9` Review 范围

- [Resume-002 revised plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`623abaa9db8b9e1fd65934a76b0e28e0fbd5e4bd65ab7f149e81f6baf1ef8c11`
- [Canonical Preflight Review及上一轮BLOCKED历史](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，更新前SHA-256：`16bf2cf8d8cba7636a65e9cd0ca58256a32129c36028070e4c57136abd0f45bf`
- [Resume-001 BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-001-review.md)，SHA-256：`d6a503a477d7a316ee0cd00a9a4c3ee0772f20219d0420a8ddd20204899b0ec8`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Runtime child spawn boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Java/MCP probe implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)

受保护 [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 仅执行固定`stat`；未hash、open、query、copy、move、write、chmod或触碰sidecars。

## Task 6 resume-002 revision `623abaa9` 主要发现

### High — 全链独立exec仍依赖不存在的shell状态，计划不可按exact blocks执行

以下节点没有完整可复制的session合同：

- Step 3 Java启动PTY block只定义`ROOT`和`RESUME_JAVA_LOG`；随后的readiness/binding block引用`JAVA_URL`与`RESUME_JAVA_PID`，却未在该block定义，也未绑定保存Step 1变量的same persistent control session。
- Step 5要求每variant先重复`df -Pk "$GATE_R1"`、fresh/no-follow和Java PID/fingerprint复核，但没有给出自包含per-variant preamble；三个run payload虽然已自包含，却只检查run targets，未包含disk、PID-file、listener和command fingerprint gate。
- `verify_run_artifacts()` block定义function后立即列出三个validator调用；首个full run后若执行whole exact block，尚未生成的workload/incremental reports必然使其失败。后文改称每run“invoke only the corresponding validator”，但独立tool exec中既没有function定义，也没有对应`FULL_*`/`WORKLOAD_*`/`INCREMENTAL_*`变量重建。full lock的post-run检查同样引用跨block`$FULL_LOCK`。
- Step 6 analyze exact block引用`ROOT`、`FULL_REPORT`、`INCREMENTAL_REPORT`、`WORKLOAD_REPORT`、`DECISION`，没有自包含定义或明确same-session binding；其后decision validator也依赖`$DECISION`。
- Step 8 protected post-stat依赖Step 1 shell中的`INPUT`和`INPUT_IDENTITY_PRE`；final JSON/secret/mode/SHA audit依赖整组path variables、`AUTH_FILTER`及arrays。若作为新的tool exec，变量为空；若要求持续session，计划没有绑定session id、生命周期、失败语义或证明这些定义仍存在。

Step 7 cleanup也依赖Java PTY/session、`RESUME_JAVA_PID`及active-chain结果，虽然所有权边界正确，但同样缺少从独立执行结果到cleanup exec的可复制state transfer。执行Agent不得临场补写变量、function或选择combined/per-run validator语义，因为这会改变本revision绑定的exact execution contract。

最小修订：为每个独立tool invocation提供自包含path derivation、function与identity读取；或在Task 6开头明确建立一个persistent control session，固定session id、在same session内执行哪些blocks、哪些observer仍必须独立、跨run如何证明session未丢失，以及中断/cleanup时的state transfer。推荐自包含：每variant固定一个preflight block、一个run block、一个对应validator/full-lock block；analyze、post-stat、final audit各自重建全部paths，并把pre tuple写成计划常量比较而非依赖shell变量。

### Pass — 上一轮正式run self-containment High已关闭

三个run payload均以`set +x`开始，在same exec内重建`ROOT`、Gate R1、MCP config、Java URL、AuthFilter和该variant targets，执行fresh/no-follow检查，定义POSIX raw-token wrapper，再调用完整CLI。credential不进入argv、stdout、文件或临时env文件；wrapper退出即unset。当前nonprinting selfcheck exit `0`、stdout零字节。

full payload同时把automatic lock列为fresh prerequisite；最终18-evidence合同把full database/report/lock计为三份，mode/SHA audit范围正确。其post-run lock检查的session-scope仍属于上述High，不否定basename/lifecycle绑定本身。

### Pass — bounded observer机制与真实argv/ancestry方向关闭上一轮竞态

每个observer stage现在是单一完整command和单一control-plane tool result；`active-chain`在同一invocation内最多240次、250ms bounded sampling，静默等待legal startup；`post-run-no-orphan`在同一invocation内bounded settle；pre只sample一次。命令`exec 2>/dev/null`、command substitution和final-only print禁止中间process table、command text或错误输出，不读取process env、不写文件；timeout/error最终只输出sanitized blocked line并exit`41`。

真实Runtime spawn argv为`node --import tsx <formalSoakRuntimeChild.ts>`，SQLite/MCP/token在env；observer不尝试从Runtime argv读取env-only runId/path，而是要求exact one含runId的diagnostic CLI、exact oneRuntime fingerprint，并以PPID ancestry绑定所有qualification MCP descendants，机制正确。当前host三条exact pre-run rows均得到numeric exit`0`和exact`role=none pid=0 ppid=0`，observer没有self-match。

本轮在发现独立的session-scope High后停止，不把未完成的startup-late/coherent/post-settle/timeout synthetic harness记作PASS，也不以其替代BLOCKED结论。修订后新Preflight仍必须机械执行这四类no-file synthetic cases。

### Pass — Current immutable/fresh/protected/resource bindings未漂移

- 八份immutable evidence仍为non-symlink regular file、mode`0600`，size和计划SHA逐一匹配；未打开partial full-001推断性能。
- 十个resume-002 targets与final diagnosis Review均absent；performance-recovery/Gate R1为non-symlink mode`0700`。
- protected tuple仍为`16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent；只做`stat`。
- disk parser返回纯数字`174385136`并高于`12582912`；port`18084`无listener；credential selfcheck不打印值。

## Task 6 resume-002 revision `623abaa9` 最终建议

只修订Task 6全链exec session合同，不改变runId、targets、variant、30分钟/30秒/60 samples、workload、threshold、persistence、credential、observer chain semantics、protected-input或cleanup边界。让Java binding、每variant preflight、对应validator/full-lock、analyze、post-stat和final audit全部可在fresh shell独立复制执行，或严格绑定一个可验证的persistent control session。计划SHA变化后重新独立strict Preflight；在PASS前不得启动Java或claim resume-002 evidence。

## Task 6 resume-002 revision `623abaa9` 后续门禁

- Preflight：`BLOCKED`；当前revision不授权Java/profile/run/analyze或任何fresh target claim。
- OpenSpec：无需新增；这是已批准diagnostic-only执行协议修正。threshold、workload、持久化、部署或用户可见合同变化才需proposal。
- Superpowers：修订计划后重新strict Preflight；新轮必须补做四类observer synthetic cases。实际execution后仍需独立strict High Review。
- Dashboard：不触发同步。
- Git/发布：未授权add/commit/push/archive/merge/tag、正式Gate D、evidence/worktree cleanup或performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-002 revision `6ac57ae` 第一轮 BLOCKED

## Task 6 resume-002 revision `6ac57ae` 当前结论

需修改：**Task 6 resume-002 Preflight BLOCKED**。用户已明确批准 resume-002 的只读 prestate/profiling 检查与三个固定 30 分钟 variants，但 revision `6ac57ae58391687f849d4484f1d12c849f041c2fd1009da1a76ae788b4148cec` 仍有两项 High 执行缺口：三个正式 run 的“精确命令”在新的 control-plane exec session 中引用只在更早 shell block 定义的路径变量和 `run_with_reviewed_token` shell function，当前协议没有把定义与 run session 绑定；同时 `yield_time_ms=10000` 后立即执行一次、禁止 retry 的 active observer，与 CLI“先完整 Java/MCP probes、后 spawn Runtime”的真实顺序存在合法竞态。任一项都可能在实现正确、服务正常的情况下确定性失败或误判 `BLOCKED`，因此本 revision 不授权启动 resume Java、claim resume-002 evidence、执行 variant 或 analyze。

本轮只读机械检查通过：八份 immutable evidence 的 non-symlink regular-file、mode `0600`、size 与 SHA-256 全部精确匹配；十个 resume-002 targets 与 diagnosis Review 均 fresh；受保护 attempt 002 main 仅执行固定 `stat`，tuple 精确匹配且 WAL/SHM absent；可用空间 `174032308 KiB` 高于 `12582912 KiB`；port `18084` clean；三行真实 pre-run observer 均返回 numeric exit `0` 和 exact `role=none`；nonprinting credential selfcheck 返回 exit `0` 且 stdout 为零字节；无文件 synthetic process-table 测试中 coherent chain 返回 `0`，incoherent MCP 与 orphan Runtime 均返回 `41`。这些 PASS 不覆盖两个 High，也不构成执行授权。

本轮未打开、query、hash、复制或修改受保护 attempt 002 SQLite；未创建/修改 evidence，未启动 Java/MCP/Runtime，未运行 profile、variant 或 analyze。唯一写入是本 canonical Preflight Review。

## Task 6 resume-002 revision `6ac57ae` Review 范围

- [Resume-002 可执行计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`6ac57ae58391687f849d4484f1d12c849f041c2fd1009da1a76ae788b4148cec`
- [Resume-001 BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-001-review.md)，SHA-256：`d6a503a477d7a316ee0cd00a9a4c3ee0772f20219d0420a8ddd20204899b0ec8`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Runtime child spawn boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Java/MCP probe implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [Existing Gate R1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Existing immutable profile](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)
- [Canonical Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)

受保护 [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 只执行 `stat`；没有读取内容，也没有触碰其 sidecar。

## Task 6 resume-002 revision `6ac57ae` 主要发现

### High — 正式 run 的 shell function/变量没有进入新 exec session，精确命令当前不可独立执行

Step 1 在一个 shell block 中定义 `ROOT`、`JAVA_URL`、`MCP_CONFIG`、三个 database/report path 等变量，Step 2 在另一个 shell block 中定义 `run_with_reviewed_token()`。Step 5 随后要求“start each diagnostic through a control-plane exec session”，但三个精确 run block只执行 `cd "$ROOT/agent-runtime"` 与 `run_with_reviewed_token ...`，没有在该 run session 中重建或导入上述定义，也没有规定持有这些定义的同一个长期 driver shell session id。

control-plane 的新 `exec_command` shell 不继承先前 shell 的局部变量或 function。因此按当前文字把任一 Step 5 block作为新的 run exec提交时，`$ROOT` 等会是空值，且 `run_with_reviewed_token` 不存在；run无法到达 credential、probe 或 Runtime 阶段。这不是执行 Agent可临场补写的细节，因为计划同时要求执行“exactly these commands”。

最小修订：把 common path derivation、credential wrapper定义和每个 run命令合并到各自同一个 exec payload；或明确创建并绑定一个 persistent driver shell session，在该 same session 内完成 Step 1/2 definitions和全部run invocation，同时保持每个 active observer仍为独立的只读 one-shot exec。修订后必须用 no-credential dummy command机械证明 function/variable scope在目标 session 中可执行。

### High — 10 秒后单次 active observer 与真实 probe-before-spawn 顺序存在合法竞态

[Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts) 的真实顺序是：validate config → read credential → await完整 Java fixtures → await独立 MCP qualification → 才调用 diagnostic runner。只有 runner 随后才 spawn [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)。Runtime真实 argv只有 `node --import tsx <formalSoakRuntimeChild.ts>`；SQLite/MCP/token等绑定在env中，故计划以唯一 runId CLI + PPID ancestry识别 Runtime/MCP 的机制本身合理，没有依赖 env-only runId/path。

但计划只等待 run exec `yield_time_ms=10000` 返回“same still-running session”，然后立即进行唯一一次 active snapshot；snapshot必须同时看到 exactly one CLI、exactly one Runtime、至少一个 Runtime descendant MCP，且明确禁止 retry/correction。在 Java/MCP preflight合法耗时超过10秒、或正处于独立 MCP probe时，该 run session仍正常 active，但 Runtime尚未 spawn；也可能只看到 CLI descendant 的 preflight MCP，而它不是 Runtime descendant。observer会按合同返回 `41` 并中止一个本可正常继续的 run。

最小修订：将 active-chain观测改为同一个 control-plane tool result内的有界 readiness loop；每次只读取单一 process-table snapshot，在 deadline内等待“CLI → Runtime → MCP”完整链出现，同时监视same run session是否已提前退出；最终只输出一次结构化 PASS或BLOCKED结果。轮询次数、间隔、deadline、session-exit优先级和最终单一 stdout schema必须固定，不能由执行器临场选择。修订后用 no-file synthetic process table覆盖 delayed-spawn、coherent、incoherent MCP与orphan Runtime。

### Pass — Resume-002 immutable/fresh/resource/credential/observer prestate机械符合

- 八份 immutable files全部为non-symlink mode `0600`，size与计划列出的八个 SHA精确匹配，包括 `gate-r1-full-001.sqlite` partial evidence及两个empty artifacts；未从 partial database推导性能结论。
- 十个 resume-002 targets和最终 diagnosis Review均 absent；parent/Gate R1为non-symlink mode `0700`。
- protected input fixed tuple为`16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM absent；disk parser返回纯数字 `174032308`，满足12 GiB fixed reserve；`18084`无listener。
- POSIX BRE credential selfcheck exit `0`、零输出，未显示 credential、长度或source line。
- 三个真实 pre-run observer结果分别为对应 runId 的 exact `role=none pid=0 ppid=0`，numeric exit均为`0`；observer自身未self-match。synthetic coherent chain得到CLI/bridge/Runtime/MCP并exit `0`，incoherent MCP和orphan Runtime均得到blocked并exit `41`。

## Task 6 resume-002 revision `6ac57ae` 最终建议

只修订同一 Task 6 的 session-scope 与 active observer readiness协议：让每个正式 run在其实际exec session内拥有完整变量/function定义；把单次时点snapshot改为单一tool-result内固定deadline的有界链就绪观测。不要改变十个targets、三个runId、variant、30分钟/30秒/60 samples、workload、threshold、persistence、credential边界、immutable history、protected-input规则或cleanup范围。计划SHA变化后重新执行独立 strict Preflight；在新 PASS 前不得claim任何resume-002 target。

## Task 6 resume-002 revision `6ac57ae` 后续门禁

- Preflight：`BLOCKED`；revision `6ac57ae...` 不授权 credential/run wrapper之后的执行，也不授权Java start、variant或analyze。
- OpenSpec：无需新增；两项均为已批准diagnostic-only执行协议修正。只有threshold、workload、持久化语义、部署或用户可见合同变化才需新proposal。
- Superpowers：修订当前计划并重新 strict Preflight；实际三个variant和analyze完成后仍需独立strict High Review。
- Dashboard：不触发同步。
- Git/发布：未授权 add/commit/push/archive/merge/tag、正式 Gate D、evidence/worktree cleanup或performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 resume-001 revision `2076369` PASS / execution subsequently BLOCKED

## Task 6 resume-001 revision `2076369` 当前结论

通过：**Task 6 resume-001 Preflight PASS**。用户已明确批准 `resume-001`；revision `2076369498ab2ef12e3d37f1a2d02962bb198a05ccfc12c67522da906e7d4514` 准确保留 execution attempt 001 的有效 immutable profile、original Java log/PID 与 BLOCKED 历史，只新增两个 fresh resume Java-control basenames，并继续使用从未 claim 的原三个 runId、六个 database/report targets和decision target。当前 host prestate、mode、SHA、protected-input stat tuple、port/process基线及三处macOS/POSIX BSD sed credential表达式均机械通过；未发现 actionable finding或确定性命令错误。

本 PASS 仅授权执行 Agent严格按上述 SHA 从 nonprinting credential selfcheck开始，依次执行：fresh resume Java owner → full/workload/incremental三个固定串行runs → analyze → owned process cleanup → protected-input post-stat → diagnosis Review与12份evidence扫描。它不授权重新profile、复用original Java log/PID、第二次resume、换runId/basename、正式Gate D、performance repair、Git write、Dashboard同步、OpenSpec archive、merge、tag或evidence/worktree cleanup。

本轮未打开、读取或hash受保护attempt 002 SQLite；仅执行固定`stat`。未创建/修改evidence，未启动Java/MCP/Runtime，未运行profile、variant或analyze。

## Task 6 resume-001 revision `2076369` Review 范围

- [Resume-001可执行计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`2076369498ab2ef12e3d37f1a2d02962bb198a05ccfc12c67522da906e7d4514`
- [Execution attempt 001 BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md)，SHA-256：`9a1572d70dc2969d2e15eff3a1fddbf11d95051763516cb73e6476c7d34f44dc`
- [Task 5 final strict High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)，SHA-256：`680fa7aa4053b1bbfe27504012bdd01856db894126a55553e2785d982fd110c1`
- [Existing performance-recovery parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/)
- [Existing Gate R1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Existing immutable profile](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/attempt-002-profile.json)
- [Original Java lifecycle log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.log)
- [Original Java PID record](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/java-gateway-18084.pid)
- [Java authentication boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Diagnostic runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Gate R1 diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

## Task 6 resume-001 revision `2076369` 主要发现

### Pass — Existing directories与attempt-001 evidence精确匹配且保持只读

[performance-recovery parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/) 和 [Gate R1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/) 均为non-symlink directory、mode `0700`。计划只验证，不recreate、chmod、rename、move或delete。

三份consumed evidence均为non-symlink regular file、mode `0600`，当前SHA与计划及attempt-001 Review完全一致：

- profile：`bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541`
- original Java log：`18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02`
- original Java PID：`db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089`

profile结构机械PASS：`databaseBytes=1835978752`、`runtime_events=2671288`、pending=`2671288`、非pending全零、其他表count为非负整数且query plans exact `15`。resume不调用profile命令，不append/truncate/overwrite/reuse这三份历史文件；original PID明确不授予任何process ownership。

### Pass — 九个resume targets fresh，protected input与process prestate可达

原三个runId及六个database/report、decision仍全部absent；新增`java-gateway-18084-resume-001.log`和`java-gateway-18084-resume-001.pid`也absent，合计九个fresh one-shot targets。最终diagnosis Review absent。

受保护attempt 002 main仅执行`stat`，当前tuple精确为`16777232:165257457:1835978752:1784167299:1784167299`，WAL/SHM均absent；未hash/open main、lock或sidecar。port `18084`无listener；计划原样的`LC_ALL=C ps -axo command= | awk`非打印扫描PASS，没有Gate R1 Runtime child或reviewed qualification fixture进程。

### Pass — 三处BSD sed raw-token extraction在实际AuthFilter上非打印通过

计划在credential selfcheck、run wrapper和final actual-token scan中使用相同POSIX BRE interval：`[^\"]\{1,\}`。在当前macOS `/usr/bin/sed`与实际 [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java) 上分别机械执行三次，均满足：declaration count exact `1`、提取值nonblank、无whitespace、不以`Bearer`开头，且全过程未输出值、长度或source line。

selfcheck发生在任何resume target claim之前；run wrapper只把raw credential导出到CLI/Runtime-child env，CLI添加唯一`Bearer ` scheme，退出即unset，因此不会double-Bearer，也不进入argv、log、PID、JSON、Review或terminal。既有profile/original log/PID的generic-secret与actual-token非打印扫描PASS。

### Pass — Resume Java ownership、三次60-sample runs、analyze与cleanup合同无回归

- Resume Java只claim两个新basenames；log用noclobber fresh mode-`0600` claim后`tee -a`，PID同样noclobber/mode-`0600`。unique `18084` listener绑定main-class+port fingerprint，只有`RESUME_JAVA_PID`和PTY session授予ownership。
- original Java PID永不用于reuse、signal或cleanup；`8080`/`18080`继续禁止inspect/reuse/stop/alter。
- full → workload-only → incremental-only三个命令保持原runId/database/report和current CLI flags。每条先执行reviewed Java/MCP probes，PASS后才spawn Runtime；每条必须exit `0`、fixed 30分钟/30秒、exact 60 samples、零hard failures、mode `0600`和exact probe signature。
- 任一credential/probe/run/sample/mode/fingerprint/orphan失败立即停止，不启动下一run或analyze；无retry、第二resume或临场新basename/runId。claimed partial evidence全部保留。
- 三份reports全部PASS后才执行analyze；decision只能`confirmed`或`inconclusive`。success/failure/interruption都只cleanup resume PTY与same PID/listener/fingerprint process，明确禁止使用original PID或broad kill。
- Final Review区分attempt-001 wrapper exit `97`与resume observations；扫描覆盖12份evidence加Review，并重复protected-input post-stat。Gate R1只有decision=`confirmed`且独立strict High Review接受claim-to-mechanism chain才可PASS。

## Task 6 resume-001 revision `2076369` 最终建议

接受revision `2076369498ab2ef12e3d37f1a2d02962bb198a05ccfc12c67522da906e7d4514`为唯一resume-001可执行计划。执行必须从Step 1完整复核prestate，再在claim任何resume evidence前运行Step 2 credential selfcheck；任何plan SHA、existing evidence SHA/mode、fresh target、protected tuple、port/process或credential结果变化立即使本PASS失效并返回`BLOCKED`，不得现场修订或第二次resume。

## Task 6 resume-001 revision `2076369` 后续门禁

- Preflight：`PASS`；仅授权上述SHA的resume-001，从credential selfcheck到resume Java、三个runs、analyze、owned cleanup、diagnosis Review与scans。
- OpenSpec：无需新增；active change保持未归档。threshold/workload/persistence/deployment/production-contract变化仍需新proposal。
- Superpowers：执行完成后必须独立strict High Review。`inconclusive`是可接受的真实diagnostic结果但不是Gate R1 PASS，也不授权选择修复。
- Dashboard：不触发同步。
- Git/发布：未授权add/commit/push/archive/merge/tag/evidence或worktree cleanup、正式Gate D或performance repair。
- 项目规则：未修改。

## 历史记录 — Task 6 revision `3693da9` PASS / attempt-001 subsequently BLOCKED

## Task 6 revision `3693da9` 历史结论

通过：**Task 6 Preflight PASS**。revision `3693da967ef35fcf9d588c4b36b34840626228d839313ff2976fe1ed6f9d32bf` 已关闭上一轮两个 High：它先验证 existing `gate-d` ancestor，再只对缺失的 `performance-recovery` 执行安全单层 mode-`0700` 创建，最后以 fresh/no-follow Gate R1 claim继续；Java log 通过 noclobber fresh claim、regular-file/mode-`0600` 校验后由 `tee -a` 追加，不再重新 truncate。上一轮已关闭的 fixed targets/CLI、raw-token/no-double-Bearer、built-in probes、三次 exact 30 分钟/60 samples、no retry、partial evidence、owned cleanup、analyze 与独立 High Review门禁未回归。

本 PASS 仅授权执行 Agent严格按上述 SHA 和用户已批准的 Task 6 范围执行：只读 immutable profile attempt 002、isolated Java `18084`、三个固定串行 variants、analyze、owned process cleanup、diagnosis Review与证据扫描。它不授权正式 Gate D、缩短/改写 workload、fallback/retry、新 runId、Git write、Dashboard同步、OpenSpec archive、merge、tag、evidence/worktree cleanup或修复实现。

本轮未打开、读取或 hash attempt 002 SQLite，未创建 `performance-recovery`/Gate R1，未启动 Java/MCP/Runtime，未运行 profile、variant或analyze。

## Task 6 revision `3693da9` Review 范围

- [可执行 Gate R1 诊断计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`3693da967ef35fcf9d588c4b36b34840626228d839313ff2976fe1ed6f9d32bf`
- [Task 5 final strict High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)，SHA-256：`680fa7aa4053b1bbfe27504012bdd01856db894126a55553e2785d982fd110c1`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Diagnostic runner/profiler](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Java authentication boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [Existing Gate D ancestor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/)
- [Fresh performance-recovery parent target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/)
- [Fresh Gate R1 target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Gate R1 diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

## Task 6 revision `3693da9` 主要发现

### Pass — Parent 与 Gate R1 fresh claim 命令可在当前 macOS host执行

当前 [Gate D ancestor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/) 是 existing non-symlink directory；[performance-recovery parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/) 与 [Gate R1 target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/) 均 absent。修订命令先对 `GATE_D_PARENT` 执行 no-follow + directory断言；当前进入 absent-parent分支，以单层 `mkdir -m 0700 "$PARENT"` 创建固定 parent并复核 no-follow/type/mode，再以单层 `mkdir -m 0700 "$GATE_R1"` 创建 fresh Gate R1并复核 mode。其 parent已存在，因此不再触发上一 revision 的 `ENOENT`。

若未来 parent已存在，命令只接受 non-symlink directory并要求 Gate R1 absent；不会复用、删除或 broad `mkdir -p`。当前 execution结束、失败或中断均明确保留新 parent、Gate R1和consumed artifacts，不把目录删除冒充rollback。

### Pass — Java log 是 fresh noclobber claim，writer只追加

修订命令在 `umask 077` 下使用 subshell `set -C; : > "$JAVA_LOG"`；existing target会 fail closed，fresh file随后必须通过 non-symlink regular-file和mode `0600`检查。Maven PTY pipeline固定使用 `tee -a "$JAVA_LOG"`，不会以默认 truncate模式重开。`pipefail`、PTY session ownership、unique `18084` listener PID、main-class/port fingerprint、PID mode/line校验和最终owned shutdown合同保持不变。

### Pass — Credential、CLI、60-sample串行和cleanup合同无回归

- AuthFilter必须exact一条完整 `Bearer ` header declaration；private subshell只提取scheme后的raw token，CLI再添加唯一 `Bearer `，因此不产生double-Bearer。token仅存在于CLI/Runtime child env，退出即unset，不进入argv、log、PID、JSON、Review或终端输出。
- profile、full/workload/incremental/analyze的完整flags、固定targets和runId仍与当前CLI schema一致；profile绑定`runtime_events=2,671,288`且全部pending，attempt 002 pre/post只比较`dev:ino:size:mtime:ctime`和sidecar presence。
- 每条run先执行reviewed Java/MCP built-in probes，全部通过后才spawn Runtime；三个variants严格full → workload-only → incremental-only串行，每条必须exit `0`、exact 60 samples、mode `0600`、零hard failures和exact probe signature。
- 任一exit `2`、capability/identity/fingerprint/sample/mode/hard-failure/orphan/interruption失败立即停止，不启动下一variant或analyze；claimed/partial evidence保留，无自动retry，新runId需要新plan/Preflight/用户授权。
- success/failure/interruption都只清理本次observed/bound PID；Java PTY Ctrl-C后按same PID + listener + command fingerprint限定TERM/KILL，并验证`18084`、Runtime child和qualification MCP无残留。进程cleanup不等于被禁止的evidence/worktree cleanup。

## Task 6 revision `3693da9` 最终建议

接受 revision `3693da967ef35fcf9d588c4b36b34840626228d839313ff2976fe1ed6f9d32bf` 为Task 6唯一可执行计划。执行 Agent必须从Step 1开始按顺序运行；任何前置fact、plan SHA、Task 5 High Review、system SQLite capability、fresh target、port/process ownership或资源发生变化，立即把本PASS视为失效并返回`BLOCKED`，不得现场修订命令。

## Task 6 revision `3693da9` 后续门禁

- Preflight：`PASS`；仅授权上述SHA的Task 6 local-only evidence execution。
- OpenSpec：无需新增；active change继续保持未归档。任何threshold/workload/persistence/deployment/production-contract变化仍需新proposal。
- Superpowers：执行完成后必须写Gate R1 diagnosis Review；只有decision=`confirmed`且独立strict High Review接受claim-to-mechanism chain，Gate R1才可PASS。`inconclusive`必须真实落盘并返回新单变量假设决策。
- Dashboard：不触发同步。
- Git/发布：未授权add/commit/push/archive/merge/tag/evidence或worktree cleanup，也未授权正式Gate D。
- 项目规则：未修改。

## 历史记录 — Task 6 revision `2dcd9b4` BLOCKED

## Task 6 revision `2dcd9b4` 历史结论

需修改：**Task 6 Preflight BLOCKED**。revision `2dcd9b4826a6bb984b9788f386807a4e7e893c02939e4544fb0783795014cabc` 已实质关闭上一轮的固定 target/完整 CLI、isolated Java ownership、env-only raw token、内建 run probes、90 分钟串行 stop/no-retry、partial evidence、机械 profile baseline、analyze 与 High Review 门禁；但 fresh host 状态与精确命令复核发现两个确定性执行错误：Gate R1 的 parent 目录当前不存在，单层 `mkdir` 必然失败；Java log 被先 claim 后又由默认 `tee` 以 truncate 模式重新打开，违反同一 revision 的 consumed/no-truncate 合同。strict Preflight 对任何确定性命令错误只能返回 `BLOCKED`。

本轮未打开、读取或 hash attempt 002 SQLite，未创建 Gate R1 目录，未启动 Java/MCP/Runtime，未运行 profile、variant 或 analyze。

## Task 6 revision `2dcd9b4` Review 范围

- [修订后的 Gate R1 诊断计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256：`2dcd9b4826a6bb984b9788f386807a4e7e893c02939e4544fb0783795014cabc`
- [Task 5 final strict High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)，SHA-256：`680fa7aa4053b1bbfe27504012bdd01856db894126a55553e2785d982fd110c1`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Diagnostic runner/profiler](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [Java authentication boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [Gate R1 intended parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/)
- [Gate R1 intended directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)
- [Gate R1 diagnosis Review target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md)

同时只读核对 macOS host 的 zsh `5.9`、jq `1.8.1`、ripgrep `15.1.0`、lsof `4.91`、固定系统命令路径、CLI flags/schema、runner cleanup 顺序与 AuthFilter exact declaration。raw-token 提取命令在不输出 token 的条件下通过：exact declaration count=`1`、提取值非空且不含 `Bearer ` scheme。

## Task 6 revision `2dcd9b4` 主要发现

### High — Gate R1 parent 不存在，当前单层 mkdir 命令确定性失败

当前以下两级目录都不存在：

- [performance-recovery parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/)
- [gate-r1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)

计划 Step 1 只执行：

```bash
mkdir -m 0700 "$GATE_R1"
```

macOS `mkdir` 未使用 `-p` 时不会创建缺失的 parent，因此该命令会以 `No such file or directory` 失败，后续 mode/target 检查均不可达。执行 Agent不得自行增加 `-p`，因为这会改变经 Preflight 绑定的精确目录 claim 命令。

最小修订是增加固定 `GATE_R1_PARENT`，对 parent 做 no-follow/type/mode 分支：当前 absent 时先以 mode `0700` 创建 parent；若未来已存在，只接受非 symlink regular directory及批准 mode。随后仍以单层 no-overwrite `mkdir -m 0700 "$GATE_R1"` claim Gate R1。也可使用经过同等 no-follow parent 验证的 `mkdir -p -m 0700`，但必须明确并重新 Preflight，不能由执行器临场选择。

### High — Java log 被 claim 后由 tee 再次 truncate，违反 one-shot evidence 合同

计划先执行：

```bash
: > "$JAVA_LOG"
chmod 0600 "$JAVA_LOG"
```

随后执行：

```bash
mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=18084 2>&1 | tee "$JAVA_LOG"
```

默认 `tee FILE` 会用 truncate 模式打开已存在的文件；因此 `$JAVA_LOG` 在 `: >` claim 后被第二次截断。即使当时长度仍为零，这也机械违反同一 Task 6 开头的“target consumed 后不得 truncation/overwrite”以及 stop contract，High Review无法区分受控首次写入和后续重开覆盖。

最小修订是保留 `: >` + `chmod 0600` 的原子 fresh claim，然后把 writer 固定为 `tee -a "$JAVA_LOG"`；或删除预创建并设计一个新的单次 O_EXCL/mode-0600 writer。推荐前者，且必须保持 `umask 077`、`pipefail` 和 PTY owner 不变。

### Pass — 上一轮其余 BLOCKED findings 已关闭

- 十个 Gate R1 targets、三个 runId、profile/full/workload/incremental/decision basenames和 diagnosis Review均已固定；profile、三个 run、analyze 的 flags 与当前 CLI一致。
- attempt 002 pre/post snapshot 使用 macOS `stat -f` 的 `dev:ino:size:mtime:ctime`，不读取或 hash 内容；profile机械断言绑定已发布 baseline：`runtime_events=2,671,288`、全部 `pending`，其他四表仅做非负整数断言。
- port `18084` 独占，明确禁止检查/复用/干预 `8080` 与 `18080`；Java PID、main-class/port fingerprint、PTY owner、TERM/KILL前重绑定和最终 release/orphan check均有 fail-closed合同。
- AuthFilter extraction只提取完整 header declaration 中 `Bearer ` 后的 raw credential，CLI自身添加唯一 scheme；token只在私有 subshell env存在，退出即 unset，不进入 argv、log、PID、JSON、Review或终端输出。
- 没有虚构独立 probe：每个 `run` 的 reviewed validation → Java/MCP probes → Runtime spawn 顺序是原子门禁；任一 probe失败 exit `2` 且不得 spawn Runtime或retry。
- 三个 variants严格串行，逐个要求 exit `0`、exact `60` samples、mode `0600`、零 hard failures和exact probe signature；任一失败停止后续 run/analyze并保留 consumed/partial evidence。
- analyzer、secret/path/raw-output scans、diagnosis Review字段、owned process cleanup以及 Gate R1 `confirmed` 后独立 strict High Review门禁均已明确；正式 Gate D、archive、merge、tag、Git write和evidence/worktree cleanup仍未授权。

## Task 6 revision `2dcd9b4` 最终建议

仅修订 [当前计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md) 的两处确定性命令：先安全创建/验证缺失的 `performance-recovery` parent，再 claim Gate R1；把 Java log writer改为 append-to-fresh-claim的 `tee -a`。计划 SHA变化后重新执行一次独立 strict Task 6 Preflight。不要借此修改 targets、runId、CLI flags、token合同、30分钟/60样本、workload、cleanup或授权范围。

## Task 6 revision `2dcd9b4` 后续门禁

- Preflight：`BLOCKED`；revision `2dcd9b4...` 不授权执行 Task 6。
- OpenSpec：无需新增；两项均为已批准 local-only执行计划的确定性命令修正。
- Superpowers：修订计划后必须重新 strict Preflight；实际 evidence 完成后仍需 diagnosis strict High Review。
- Dashboard：不触发同步。
- Git/发布：未授权 add/commit/push/archive/merge/tag/cleanup或正式 Gate D。
- 项目规则：未修改。

## 历史记录 — Task 6 revision `145d96e` BLOCKED

## Task 6 历史结论

需修改：**Task 6 Preflight BLOCKED**。用户已明确授权只读 immutable profiling 既有 attempt 002，并执行三个固定 30 分钟 diagnostic variants；Task 5 strict High Review、当前固定 `/usr/bin/sqlite3` capability、受保护输入 stat 基线、MCP fixture 路径与本机资源均满足技术前置。但权威计划的 Task 6 仍未给出可复制执行的完整命令、固定 evidence 文件名、Gate R1 目录创建方式、隔离 Java Gateway 的启动/凭证/PID/日志/清理所有权，以及外部中断后的 Runtime child 与已 claim 制品处理规则。strict Preflight 不能把这些运行期安全和证据绑定决策留给执行 Agent 临场补齐。

本 `BLOCKED` 不否定用户授权，也不要求新 OpenSpec；它要求先修订同一份已批准诊断计划并重新做 Task 6 Preflight。未通过前不得打开 attempt 002、启动 Java/MCP/Runtime、执行任何 30 分钟 run 或 analyze。

## Task 6 Review 范围

- [Gate R1 诊断实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，当前 revision SHA-256：`145d96eb924e1c8745b3abbc9f3e14255a7c6576078659a4477bce8a83f36e1b`
- [Task 5 final strict High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)，当前 SHA-256：`680fa7aa4053b1bbfe27504012bdd01856db894126a55553e2785d982fd110c1`
- [Diagnostic CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [Diagnostic runner/profiler](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)，SHA-256：`c44755955ab84ddd8b3d4e7758570a3e2ddd2768c0ae933ca98fb4cc378fbd80`
- [Diagnostic tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)，SHA-256：`915ad46ffc8caf4c92b42255b6971288ae674516057b439a62fbca7220bd39a0`
- [Formal Java/MCP probe implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [Reviewed attempt 002 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/mcp-config.json)
- [Deterministic MCP fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/fixtures/mcp/qualification-server.ts)
- [Java Gateway configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/resources/application.yml)
- [Java local authentication boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [Gate D attempt 002 failure Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-attempt-002-failure-review.md)
- [Gate R1 evidence parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/)

受保护 [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) 与 [attempt 002 runtime.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite.lock) 仅执行 `stat`；未读取、打开、hash、复制、移动、删除或写入。未启动服务、MCP、Runtime、profile、30 分钟 run 或 analyze。

## Task 6 主要发现

### High — Task 6 没有完整、固定、可审计的 CLI 与 evidence-path 合同

计划仅复述 `profile`、三个 `run` 与 `analyze` 的目标，没有列出可复制命令，没有绑定 `--project-root`、`--input-sqlite`、`--java-url`、`--mcp-config`、三个 `--sqlite-path`、四个 report/profile/decision `--output` 的精确绝对路径。三个 runId 虽已固定，但数据库与 report basename 未固定，因而无法在执行前机械证明“runId + database + report”三者 fresh/no-overwrite，也无法在执行后建立唯一 claim-to-artifact 映射。

[Gate R1 evidence parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/) 当前不存在；CLI 的 `canonicalOutput` 要求 parent 已存在且可 canonicalize，计划却没有给出目录创建、mode、owner 或失败处理命令。执行 Agent若自行选择命名或创建方式，会改变证据合同。

修订计划应至少固定以下 no-overwrite basenames，并写出四条完整 CLI 命令：

- `gate-r1-attempt-002-profile.json`
- `gate-r1-full-001.sqlite` 与 `gate-r1-full-001-report.json`
- `gate-r1-workload-001.sqlite` 与 `gate-r1-workload-001-report.json`
- `gate-r1-incremental-001.sqlite` 与 `gate-r1-incremental-001-report.json`
- `gate-r1-decision-001.json`

还应固定以 mode `0700` 创建 Gate R1 parent、所有 targets 执行 `lstat` absent 检查、所有生成 JSON/SQLite 为 mode `0600`、每个命令预期 exit code，以及任一非零或样本数不足时立即停止串行链且不得继续下一 variant/analyze。

### High — Java/MCP prerequisite、凭证与服务所有权没有落成执行合同

只读检查确认本机没有 OpenHarness Java Gateway；隔离端口 `18084` 无 listener，默认端口 `8080` 被非 Java 进程占用，禁止复用或干预。reviewed MCP config 指向当前 executable 的 [Agent Runtime tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/node_modules/.bin/tsx) 与现存 credential-free qualification fixture，MCP 输入本身可用。

当前 shell 未设置 `OPENHARNESS_SERVICE_TOKEN`，项目根与 backend 均无 `.env`。这不是外部生产凭证 blocker：repo 已定义 deterministic local auth contract，执行器可以把匹配值只注入 isolated Java/diagnostic CLI 子进程环境，不放入 argv、stdout、stderr、JSON 或 Review。但计划没有固定该注入方式，也没有固定 Java `18084` 启动命令、工作目录、日志文件 mode/redaction、PID capture、ready timeout、复用时进程身份校验、谁拥有 graceful shutdown，以及三次 run 之间 Java 是否保持常驻。

此外 diagnostic CLI 没有独立 `probe` 子命令。`run` 会按 `validate MCP config -> 读取 env token -> Java health/catalog/三 fixture/tool-time -> MCP fixture -> Runtime child` 顺序执行；因此 Task 6 Step 2 不能作为单独 CLI 命令执行。修订计划必须明确选择以下之一：

1. 把 Step 2 定义为每条 `run` 的内建 fail-before-Runtime preamble，首条 full run 的 probe PASS 即 prerequisite checkpoint；或
2. 重新打开实现范围，增加并 Review 一个真正的 no-runtime probe 命令。

不能在执行时临时用未经 Review 的 `tsx -e`、`curl` 组合或 credential argv 替代。

### High — 90 分钟串行运行缺少外部中断、残留进程与 partial artifact 规则

runner 对内部异常会按 workload → Runtime → database probe 顺序清理，但 diagnostic CLI/runner 没有 formal Gate D 那样的 SIGINT/SIGTERM operator interruption handler。若宿主 shell、Codex session 或 CLI 在 30 分钟内被外部终止，不能假设 Java、Runtime/MCP child、空/部分 SQLite 与已 claim report 会自动进入一致状态。

计划没有规定：谁监控 child PID/port、什么信号可发送、超时后如何只终止本次拥有的 Runtime/MCP/Java、如何证明没有 orphan、如何保留而不覆盖 partial DB/report、失败后是否必须换新 runId/basename，以及用户所说“不得 cleanup”与必要的进程级 cleanup 的边界。strict 运行不能在这些规则缺失时开始。

修订计划应明确：三个 variants 严格串行；任一 command exit 非零、hard failure、不是 exact 60 samples、服务身份改变或 output identity 异常即停止；保留已生成 evidence，不删除/覆盖；重试必须新 runId/新 basename/新授权；只允许终止本 Task 6 启动且 PID/identity 已绑定的进程；Java 在全部三次 run 和 analyze 完成或首次 blocker 后由原启动 owner graceful shutdown；停止后验证 `18084`、Runtime 动态端口及 qualification child 均无本任务残留。

### Medium — attempt 002 profile 的外部验收值与 stat 证据命名不完整

固定 `/usr/bin/sqlite3` 当前为 `3.51.0`，`:memory:` capability probe 返回 DBSTAT=`1`、JSON=`1`、query-only=`1`；该 probe 未访问 attempt 002。Task 5 Review 绑定的 source/test/package/lock SHA 均仍一致。

attempt 002 当前 stat 基线为：main `dev=16777232`、`ino=165257457`、`size=1835978752`、`mtime=1784167299`、`ctime=1784167299`、mode `0600`；`-wal` 与 `-shm` 不存在；lock `dev=16777232`、`ino=165257942`、`size=0`、`mtime=1784165719`、`ctime=1784165719`、mode `0600`。计划要求 profile 后这些字段不变，但未固定 pre/post stat 记录位置和比较命令。profile JSON又有意不携带路径、child raw output或文件 identity，因此仅凭 CLI exit 0 无法在最终 Review 中重建外部 metadata comparison。

此外 failure Review 只量化数据库约 `1.71 GiB` 与 latency，不提供五张表、delivery distribution、dbstat 或 cardinality 的 expected 数字；“aggregate counts match failure Review”不能作为精确机械断言。修订计划应把验收改为：profile `databaseBytes` 精确等于 stat size；五张表等 schema/count 均为非负且与 fixed SQL 自洽；若要声称与既有 report 匹配，必须列出该 report 实际提供的可比较字段，不得虚构不存在的 aggregate baseline。

## Task 6 最终建议

1. 只修订 [当前诊断计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md) 的 Task 6：加入固定目录/文件名、完整四类 CLI 命令、stat/fresh/mode 检查、isolated Java `18084` 启停与 env-only credential 合同、probe 与首条 run 的关系、90 分钟 stop/abort/orphan/partial evidence 规则。
2. 若采用“run 内建 probes 是 Step 2”方案，无需改源码或新 OpenSpec；计划 revision 变化后重新做 Task 6 strict Preflight。
3. 若坚持独立 no-runtime probe，必须重新打开 CLI source/test 实施与 strict Review；仍可留在 active OpenSpec，但 Task 6 要等新 implementation Review PASS。
4. Preflight PASS 后，执行顺序固定为：建立 fresh evidence parent并记录 stat/capability → profile attempt 002 → 启动/绑定 isolated Java → full → workload-only → incremental-only → analyze → 写 diagnosis Review → 由原 owner 清理本次服务进程。任一 blocker立即停止，禁止缩短时间、复用 DB/report、fallback、自动重试或继续后续步骤。

## Task 6 后续门禁

- Preflight：`BLOCKED`；当前 revision 不允许执行 Task 6。
- 用户授权：已存在且范围清楚；计划修订不扩大到正式 Gate D、archive、merge、tag 或 worktree/evidence cleanup。
- OpenSpec：无需新增；若增加独立 probe 也先在 active change 内做现有 local-only诊断实现修订与 Review。若改变阈值、workload、持久化语义、部署或生产契约，才需新 proposal。
- Superpowers：修订后的当前计划必须重新 strict Preflight PASS；实际 90 分钟执行后仍需独立 High Review 接受 claim-to-mechanism chain。
- Dashboard：不触发同步。
- Git/发布：未授权 add/commit/push/archive/merge/tag/cleanup。
- 项目规则：未修改。

## 历史记录 — Task 5 当前 PASS revision

## 结论

通过：**Preflight PASS**。`2026-07-17` 最新 revision 已关闭上一轮唯一 finding：Task 5 现在会在首个编辑前记录 `agent-runtime/package.json` 与 `pnpm-lock.yaml` 的 SHA-256 和 exact diff 基线，并在 GREEN、scans、High Review 与 stop conditions 中要求结束状态与该基线完全一致。当前 lockfile 相对 HEAD 无 diff；package 仅有 Task 4 已批准的 `diagnostic:gate-d-performance` script 单行 diff。Task 5 仍只能修改 profiler source/test 两个文件，不授权 package/lockfile 新变化。

本 PASS 仅授权 Task 5 按 TDD 实施、验证和 strict High Review；不授权 profile 既有 Gate D SQLite、30 分钟运行、正式 Gate D、OpenSpec archive、Dashboard 状态迁移、Git publication、合并、tag 或清理。Task 6 仍须用户另行明确授权。

## 当前 Review 范围

- [Gate R1 诊断实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，当前 revision SHA-256：`145d96eb924e1c8745b3abbc9f3e14255a7c6576078659a4477bce8a83f36e1b`
- [Task 5 implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Task 4 package script diff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [Root lockfile](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/pnpm-lock.yaml)

未读取、打开、hash、复制、移动、删除或写入三份既有 Gate D SQLite/lock 制品；未运行真实 profile、30 分钟 variant 或 Gate D。

## 当前主要发现

### Pass — Task 5 package/lockfile 基线门禁可达

计划在 Task 5 Step 1 首次编辑前记录两个文件的 SHA-256、package unified-zero diff 和 lockfile exact diff；预期明确为 lockfile 无 diff、package 只有 Task 4 已批准的 script 单行新增。Step 4 重取同一组证据并要求 hash 与 exact diff 均完全等于基线，Step 7 scans、Step 8 High Review 和 stop conditions 也复用同一合同。

只读核对当前工作树事实与计划期望一致：[pnpm-lock.yaml](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/pnpm-lock.yaml) 相对 HEAD 无 diff；[agent-runtime package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json) 仅新增 `diagnostic:gate-d-performance` script。未发现其他合同变化。

## 当前最终建议

1. 接受 revision `145d96eb924e1c8745b3abbc9f3e14255a7c6576078659a4477bce8a83f36e1b` 为 Task 5 可执行计划。
2. 实施前先落证 package/lock hash 与 exact diff 基线；任何后续变化立即停止，不得通过还原或扩大范围掩盖。
3. Task 5 只修改 [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts) 与 [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)，完成 full verification 与独立 strict High Review 后再判断 Task 5 是否 PASS。

## 当前后续门禁

- Preflight：`PASS`；仅授权 Task 5 当前两文件范围的 TDD、验证与 Review。
- OpenSpec：当前无需新 proposal；范围仍是 active `harden-agent-runtime-single-node-production` 下的 local-only 诊断收口。
- Task 6：仍未授权；即使 Task 5 后续 PASS，也必须由用户另行明确授权真实 evidence execution。
- Dashboard：不触发同步；本次只更新 canonical Review。
- Git/发布：未授权 add/commit/push/merge/tag/archive/cleanup。
- 项目规则：未修改。

## 历史记录 — Task 5 package/lock baseline BLOCKED revision

Revision `81e9e4c5c4a4d84585ea5369c61a625750c6afe9c4214d46feb0d432d7dc9593` 曾因要求 package/lockfile 相对 HEAD diff 同时为空而 `BLOCKED`；该条件与 Task 4 已批准的 package script diff 冲突。对应 canonical Review revision SHA-256 为 `43cb9d652f855dfeab6595e333be8c6c35429258e524a13d4a6df2601f72a1ba`。最新计划已用 Task 5 前后 SHA-256 + exact diff 基线关闭该 finding，旧 BLOCKED 不再授权或描述当前计划。

## 历史记录 — Task 3 inode-binding revision

### 历史结论

通过：用户已明确批准把 Task 3 扩展到 Runtime child/storage-open，以关闭启动期间 SQLite 路径替换可在事后校验前写坏目标库的 High 风险。当前 revision 仍严格限制为 local-only 根因诊断；新增范围只提供可选的诊断 expected inode identity，并要求在实际 SQLite connection 打开后、任何 WAL pragma/migration/write 前 fail closed。正式 Gate D 与普通 production entrypoint 不传该参数，默认持久化语义不变。

本 PASS 仅授权执行诊断计划，不代表 admission 退化已修复，不授权新的正式 Gate D、OpenSpec archive、Dashboard 状态迁移、Git publication、合并、tag 或工作树清理。

## Review 范围

- [Gate R1 诊断实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)
- [Gate D recovery final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-recovery-final-plan.md)
- [Gate D attempt 002 failure Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-attempt-002-failure-review.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Existing Gate D production executor plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Current formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [Current formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [Current server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [Current sqliteRuntimeAdapters.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [Current traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/traceOutbox.ts)
- [Task 3 inode binding decision Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-task3-inode-binding-decision-review.md)
- [Runtime storage open](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [Production Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- [Formal Runtime child](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)

Plan revision SHA-256: `a182f569615b45d0fbcd5769da9a7685884f235e6d846b1a870c1b15e2edb9da`.

## 主要发现

### Pass — OpenSpec 与任务边界清晰

现有 approved `harden-agent-runtime-single-node-production` 已明确固定 Gate D workload、admission/replay 阈值、SQLite/outbox、24 小时 soak 和 fail-closed qualification。计划只增加诊断能力并恢复现有合同的可验证性，不改变 API/schema、阈值、workload、retention 或持久化 lifecycle，因此当前无需新 OpenSpec。

计划包含明确再判定：若诊断结论要求改变 public session contract、retention、persistence/outbox lifecycle 语义、阈值或 workload，必须停止并新建 proposal，不能借诊断计划越权实施。

### Pass — Systematic debugging 顺序正确

计划没有把当前三个候选直接转成修复。执行顺序为：

1. 对现有 full oracle 增加 observation-only timing，formal default 不变；
2. 对 attempt 002 做 immutable aggregate-only profile；
3. 使用 fresh database 跑 `full-oracle`、`workload-only`、`incremental-oracle` 三个固定 30 分钟实验；
4. 按预定义 confirmation rule 输出 `confirmed` 或 `inconclusive`；
5. 根因确认后另建 repair plan。

该顺序符合“根因确认前不修复”的硬门禁。

### Pass — Formal Gate D 与 local diagnostic 隔离充分

- 正式执行仍要求 `new GateDDatabaseObservationCursor()` 默认 `formal-full`。
- local report 使用独立 `track: "local"` 和 `evidenceKind: "gate-d-performance-diagnostic"`，不调用 formal report builder。
- CLI 不接受 duration、sample interval、workload、threshold、track、restart 或 production approval 参数。
- 30 分钟运行无 TS restart，原因是 attempt 002 在 hour 2 前已失败；这不会冒充完整 Gate D。
- 所有数据库/输出要求 fresh、mode-0600、no-overwrite；attempt 002 只能 immutable/read-only 输入。
- expected database identity 仅由 local diagnostic runner 显式传入；formal Gate D 和普通 production entrypoint 保持无该参数的默认路径。

### Pass — Task 3 inode binding 扩展关闭已确认的写前竞态

用户已批准扩展 Task 3 文件范围。计划明确把 identity 校验放在实际 `better-sqlite3` connection 打开后、`journal_mode`、WAL、migration、integrity 与 reconciliation 之前，并要求 mismatch 关闭连接、使用固定不回显路径的错误退出。破坏性测试必须证明替换到原路径的临时 sentinel SQLite 在失败后 bytes/hash/size/mtime 均不变。

该扩展不改变 schema、migration 内容、正常 storage lifecycle 或正式 Gate D 默认行为，因此沿用 active `harden-agent-runtime-single-node-production`，不创建新 OpenSpec。若实现需要把 identity 变成通用必填契约或改变持久化语义，Preflight 立即失效并返回 OpenSpec 审批。

独立 Preflight 初次返回 `BLOCKED` 后，当前 revision 已修正全部范围与证据缺口：Planned Files、Gate 1、Task 3 与 Task 5 均覆盖完整传播链；RED/GREEN 明确运行 diagnostic、formal child/executor 与 runtime storage 三组测试；actual-child destructive test 必须在 storage open 前 swap，并比较 sentinel 前后 bytes、SHA-256、size、mtime；继承环境清除、完整成对覆盖、非法 identity、connection close 与固定不泄漏错误均进入验收。

### Pass — 实施与验证信息可执行

六个任务均列出精确文件、测试先行步骤、预期 RED/GREEN、核心类型/函数签名、focused/full 命令、Step Evidence Gate、rollback 和 stop conditions。计划还覆盖 formal CLI/report non-regression、OpenSpec strict、Dashboard check、diff/status、negative/secret scan 和 strict High Review。

### Risk — A/B 运行需要真实本地资源和约 90 分钟 wall-clock

三个 30 分钟运行必须顺序使用新数据库，且依赖 Java Gateway 和 MCP fixture。环境或服务探针失败时应标记 `BLOCKED`，不能减少样本、复用数据库或压缩时钟来补足证据。该风险已由 CLI preflight、固定常量和 fresh output 约束覆盖，不阻塞计划执行。

### Risk — Outbox 可能只能被量化为 contributing/unresolved

三个主实验首先隔离 database oracle；session replay 通过 workload-only 趋势与 immutable per-session p50/p95/max profile确认。Outbox 若无法满足“oracle removal 后仍相关 + production wiring 证明 lifecycle absent/stalled”的双重条件，analyzer 必须输出 `contributing` 或 `unresolved`，不能伪造 primary-cause 结论。此 fail-closed 设计满足 Gate R1；若整体仍 `inconclusive`，计划明确返回单变量诊断而不是实施修复。

## 最终建议

1. 接受本 revision 为 Gate R1 可执行计划；若计划内容继续变化，重新计算 SHA-256 并重跑 Preflight Review。
2. 执行时先完成 Task 1–4 的 diagnostic tooling 和 focused tests，再做 Task 5 full verification/High Review；Review PASS 后才运行 90 分钟 A/B。
3. Gate R1 结果为 `confirmed` 才创建独立 admission repair plan。结果为 `inconclusive` 时不得选择“最像的修复”。
4. 保留 attempt 002 SQLite/lock 原样，不暂存、不移动、不删除。
5. 不同步 Dashboard；本轮计划/Review 不触发 `proposed`、`verified` 或 `archived` 状态节点。

## 后续门禁

- OpenSpec proposal：当前不需要；出现 contract/threshold/workload/retention/persistence semantic change 时必须新建并获批。
- Superpowers execution：需要。执行应选择 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`；未选择前不实施。
- TDD：Task 1–4 必须按 RED/GREEN 执行；diagnostic behavior 不能只写实现后补测试。
- Review：Task 5 strict High Review PASS 后才允许真实 A/B；Gate R1 diagnosis 还需要单独 Review。
- 人工审批：本计划不需要 Gate D production start approval；后续新的正式 Gate D 仍需全新 runId、preflight 和明确审批。
- Git/发布：未授权 commit/push/merge/tag/archive/cleanup。
- 项目规则：未修改。
- Task 3 扩展授权：已由用户明确批准；仅限当前 revision 列出的 optional diagnostic inode-binding 范围。
