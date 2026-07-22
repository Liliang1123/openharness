# Agent Runtime Admission Performance Diagnosis Task 5 Implementation Review

## 结论

通过：Task 5 final strict High Quality re-review 结论为 **PASS**，未发现 actionable finding；首次 Review 的 High finding 已由用户批准的 diagnostic-only 固定 `/usr/bin/sqlite3` 方案关闭，Task 5 可以收口。

本轮 fresh focused `159/44/8/8`、full Runtime `75 files / 615 tests`、typecheck、OpenSpec strict validate、Dashboard check、diff check、live-WAL immutable 定向重放与真实 child sentinel swap 定向重放均通过。实现使用一个固定绝对路径 child、一个 immutable URI connection、静态 profiler script 和 fail-closed protocol；未发现 shell、PATH、父进程环境、普通 readonly fallback、额外 connection 或受保护证据写入。

本结论不授权 Task 6 的实际 profile、三次 30 分钟 variant 或正式 Gate D。Task 6 即使技术前置满足，仍须独立确认本地 Java/MCP prerequisite、同机 `/usr/bin/sqlite3` capability，并取得明确运行授权。

## 首次 FAIL 历史（保留）

需修改：Task 5 strict Implementation Review 结论为 **FAIL**，当前不允许进入 Task 6。

fresh focused `128/44/8/8`、full Runtime `75 files / 584 tests`、typecheck、OpenSpec strict validate、Dashboard check、diff check 以及真实 child sentinel swap 定向重放均通过；identity claim 已完整传播到 storage open，并在 WAL、migration、integrity、reconciliation 等写能力动作之前校验；formal/normal production 默认不携带 identity；诊断 runner、CLI、analyzer 的 fixed workload、local-only、fresh/no-overwrite、三 variant、cleanup、redaction 与 fail-closed 边界未发现其他 actionable finding。

但是 immutable offline profiler 在当前实际依赖 `better-sqlite3 12.11.1` 下不会以 SQLite URI `mode=ro&immutable=1` 打开输入，而会确定性退化为普通 `readonly` connection。该行为违反权威计划的显式 execution contract，无法证明 attempt 002 SQLite 在 Task 6 profile 时处于要求的 immutable input 语义，因此构成一个 **High** finding 并阻断 Task 6。

### 首次 Review 范围

#### 权威制品与规则

- 实际 dirty worktree：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 基线 HEAD：`cccd964a723a0606178c1863f6701c8483be6f8e`
- 项目规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)
- OpenSpec 规则：[openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- 工程不变量：[docs/engineering-invariants.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/engineering-invariants.md)
- 领域术语：[CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/CONTEXT.md)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，复核 SHA-256：`a182f569615b45d0fbcd5769da9a7685884f235e6d846b1a870c1b15e2edb9da`
- Task 3 PASS Review：[2026-07-17-agent-runtime-task3-diagnostic-runner-quality-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-task3-diagnostic-runner-quality-review.md)，复核 SHA-256：`69c0c40de049645bad95dae91f3a55a9ced5f10ccb8755ba4313cefaa97ef09a`
- Task 4 PASS Review：[2026-07-17-agent-runtime-task4-diagnostic-cli-quality-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-task4-diagnostic-cli-quality-review.md)，复核 SHA-256：`0fea2aef3543e40657f2941b23f10f3b8746f8d033b58ca4b7388871f57055d8`
- OpenSpec proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

#### 完整实际 source/test diff

- [agent-runtime/package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)
- [runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts)
- [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)

同时只读核对了未修改的 formal oracle/CLI/report 路径：

- [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localBaseline.ts)
- 当前安装依赖的 native open mask：[better-sqlite3 database.cpp](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/node_modules/better-sqlite3/src/objects/database.cpp#L159)

#### 受保护既有证据

以下三份文件严格只执行了 `git status` 与 `stat`；未读取内容、未计算文件 SHA、未打开、未写入、未移动、未删除：

- [attempt 001 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/runtime.sqlite)：size `0`，mtime epoch `1784164996`，mode `-rw-------`
- [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：size `1835978752`，mtime epoch `1784167299`，mode `-rw-------`
- [attempt 002 runtime.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite.lock)：size `0`，mtime epoch `1784165719`，mode `-rw-------`

未运行 profile、任何 30 分钟 variant、正式 Gate D、commit、push、archive、merge、tag 或 cleanup；未生成可供扫描的诊断 output。

### 首次主要发现

#### High — immutable profiler 在实际依赖下确定性退化为普通 readonly，违反 attempt 002 immutable input 门禁

位置与依据：

- 权威计划 [execution contract 第 22 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md#L22) 明确要求 offline profiling 必须使用 SQLite URI `mode=ro&immutable=1`；[Task 2 第 322 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md#L322) 给出同一打开契约；[Task 5 第 661 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md#L661) 再次要求 attempt 002 只能是 immutable input。
- 实现 [gateDPerformanceDiagnostics.ts:1388](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L1388) 尝试 URI 后，在 `SQLITE_CANTOPEN` 时于 [gateDPerformanceDiagnostics.ts:1403](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L1403) 改用普通路径 `new Database(databasePath, { readonly: true, fileMustExist: true })`。
- 实现自身注释已承认当前 `better-sqlite3 12.x` 不传递 `SQLITE_OPEN_URI`。本机实际安装的 native open mask 在 [database.cpp:159](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/node_modules/better-sqlite3/src/objects/database.cpp#L159) 至第 163 行仅包含 `SQLITE_OPEN_READONLY` / `READWRITE` / `CREATE`，没有 `SQLITE_OPEN_URI`。因此 URI primary path 在当前依赖上不会获得 `immutable=1` 语义，fallback 不是边缘兼容分支，而是实际执行路径。
- `readonly` + `query_only` 可以阻止 SQL 写入，但不能替代 SQLite `immutable=1` 的不变文件、WAL/locking 与 sidecar 假设。尤其 Task 6 的输入是失败尝试留下的 1.8 GiB SQLite；在未证明 immutable URI 真实生效前，不应对该受保护证据执行 profiler。
- 现有 profiler tests 证明 query-only、aggregate-only、identity binding 和 URI literal collision，不证明 native connection 的 `immutable=1` flag 生效，因此 full suite 全绿不能关闭此 finding。

影响：Task 6 第一步就是对 attempt 002 生成 offline profile。当前实现无法满足其前置不可变输入契约，直接执行会跨越 strict evidence boundary；因此 Task 6 必须阻断。

与 Task 2 已知 fallback residual 的关系：该问题不是 Task 3/Task 4 新引入的 runtime regression，而是 Task 2 为兼容当前 `better-sqlite3` 留下并在实现注释中明确记录的 residual。Task 3 与 Task 4 的 PASS 分别覆盖 runner/identity 与 CLI/analyzer，不能替代 Task 5 对全实现和 attempt 002 immutable contract 的最终 strict 审核；前序 PASS 也没有把普通 readonly fallback 升格为获批例外。因此本 Review 在真实 evidence run 之前将这一已知 residual 正式提升为阻断 finding。

Task 6 的运行前后 `stat` 不能补足该合同。size/mtime 对比只是事后检查主文件的两个元数据，不能证明 connection 使用了 `immutable=1`，不能覆盖 WAL/shared-memory sidecar、locking、读取活动 WAL 状态或缓存一致性假设，也不能在证据已被访问后恢复其原始可信边界。strict 门禁要求在打开前就保证连接语义，而不是运行后以“主文件看起来未变”推断连接曾经 immutable。

未发现其他 actionable finding。

### 首次已验证的不变量

1. **identity chain 与写前门禁**：diagnostic claim 的 `dev/ino` 通过 child spawn environment、child config、`createProductionServer`、`openProductionRuntimeContext`、`openProductionRuntimeStorage` 到 `openRuntimeDatabase`；实际连接通过 `PRAGMA database_list` 解析 main path 后先做 identity `stat`，再执行 `journal_mode = WAL`、migration、integrity 或 reconciliation。
2. **真实 sentinel swap**：单独 fresh 重放真实 child startup，用暂停 MCP fixture 在 storage open 前 rename claim 并将 sentinel symlink 到原路径；child 非零退出且 sentinel 的 `Buffer bytes`、SHA-256、size、mtime 四项均与 before 完全相等，journal 不含 token/path/dev/ino。
3. **正常默认无 identity**：formal spawn spec 会清除继承的 `GATE_D_EXPECTED_DATABASE_DEV/INO`；仅 diagnostic 显式 claim 时成对加入。`executeGateDProductionSoak` 仍调用无参数 `new GateDDatabaseObservationCursor()`，normal production entrypoint 只传 databasePath/serviceToken。
4. **formal 非回归**：formal CLI flags、`assertFormalGateDReport`、formal runner、shared baseline schema 路径无 diff；formal-full 七条 SQL、短路顺序与默认构造保持，diagnostic artifacts 的 `track/evidenceKind/schema` 不能通过 formal `RuntimeBaselineReportSchema` 与 fixed production invariants。
5. **fixed experiment**：三 variants 共用固定 30 分钟、30 秒、60 samples、10,000 seeded conversations、20 concurrency、60/20/15/5 mix、同一 fixture mapping 与 HTTP transport；变量仅为 full 七条 oracle、incremental 单条 oracle、workload-only 无 oracle。
6. **fresh/no-overwrite**：runner 在启动前以 `O_CREAT|O_EXCL|O_NOFOLLOW` 成对 claim SQLite/output，绑定 dev/ino、0600、fsync 且不删除并发 replacement；CLI 对 run/output、profile/decision 均 canonical containment + no-overwrite，并拒绝 attempt 001/002 packet output target。
7. **cleanup/redaction**：stop 顺序为 workload → Runtime → probe；部分启动与 failure 均 fail closed；child journal、dependency failures、CLI stdout/stderr 与 JSON writers 使用稳定错误类/失败码并过滤 service token、path、identity、Bearer、`sk-` 与 canary。
8. **analyzer 边界**：exact 60、sampleIndex、strict timestamp、generatedAt、variant timing signature、distinct runId/database basename、environment fingerprint 与 hard failure 均参与结构绑定；只能产出 local diagnosis 的 `confirmed/inconclusive`，不会声明 fix、formal Gate D PASS 或生产升级；session replay/outbox 缺 profile/static-wiring proof 时只能 contributing/unresolved。

### 首次精确命令结果

所有命令均在 [实际 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/) fresh 执行；无 sandbox `EPERM`，无需 escalated 重跑。

| 命令 | 结果 |
|---|---|
| `pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics` | PASS；1 file，128/128 tests |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakExecution` | PASS；1 file，44/44 tests |
| `pnpm --filter @openharness/agent-runtime test -- runtimeStorage` | PASS；1 file，8/8 tests |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakCli` | PASS；1 file，8/8 tests |
| `pnpm --filter @openharness/agent-runtime test` | PASS；75 files，584/584 tests；stderr 仅为既有 MCP 负向 fixture 的预期解析/脱敏日志 |
| `pnpm --filter @openharness/agent-runtime typecheck` | PASS；exit 0，无 type error |
| `pnpm --filter @openharness/agent-runtime exec vitest run test/formalSoakExecution.test.ts -t 'fails an actual child storage open before a swapped sentinel database can be mutated' --reporter=verbose` | PASS；1/1，43 skipped；真实 child sentinel swap 约 498ms，内部逐项断言 bytes/SHA-256/size/mtime 全等 |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | PASS；`Change 'harden-agent-runtime-single-node-production' is valid` |
| `pnpm dashboard:check` | PASS；generated outputs current；36 entries；未编辑 Dashboard |
| `git diff --check` | PASS；exit 0，无 whitespace error |
| `git status --short --untracked-files=all` | scope 与前序 Review 一致：计划内 source/test/docs，加三份受保护既有 SQLite/lock；本 Review 落盘后仅新增本文件 |
| scoped sensitive scan | PASS with expected matches only；命中为 Authorization runtime 模板、redaction/invariant regex、SQL canary probe 与负向测试字面量；未发现原始 secret value |
| scoped override/escalation scan | PASS；source 无 duration/sample/threshold/track/restart/overwrite/credential CLI override；`--workload-report` 仅为 analyze 的固定第三份输入；production/formal evidence scan 无 diagnostic source 命中 |
| formal diff check | PASS；formal CLI、formal runner、local baseline 与 shared schema 无 diff |
| `stat -f ...` 三份受保护 SQLite/lock | PASS；只记录前述 size/mtime/mode，未读内容 |

测试 PASS 不能覆盖本 Review finding：当前测试契约只机械证明 read-only/query-only，而权威门禁要求的是真实 `immutable=1` connection 语义。

### 首次最终建议

1. 最小安全修复是删除普通 readonly fallback，使当前不支持 `SQLITE_OPEN_URI` 的 driver fail closed。该路径只需修改 [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts) 与 [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)，不扩出已批准 Planned Files、不需要新 OpenSpec；但它只关闭“不安全降级”，仍不能授权 Task 6 profile。
2. 要同时恢复 Task 6 可执行性，应采用 diagnostic-only、可机械证明向 `sqlite3_open_v2` 传入 `SQLITE_OPEN_URI` 并使 `mode=ro&immutable=1` 生效的受控打开方式。若能在上述两个既有文件内完成且不改变 production driver、部署或公共契约，可留在当前计划，无需新 OpenSpec。若需要增加/替换依赖、修改 lockfile、native build 或部署前置条件，则先显式批准扩展 Planned Files；若触及 production SQLite driver、部署契约或 persistence lifecycle，必须重新进行 OpenSpec 决策，不能在 Task 5 修复中自行扩大范围。
3. 增加 focused regression，证明实际打开路径的 native flags/行为含 immutable URI 语义；测试不得只断言 `database.readonly`、`PRAGMA query_only` 或主文件 mtime 未变。
4. 修复后 fresh 重跑 Task 5 全部六项 Runtime 验证、OpenSpec strict、Dashboard check、diff/status、scans、真实 child sentinel swap，并由独立 strict High Reviewer 对完整实际 diff 重新 Review。
5. 不要在 finding 关闭前对 attempt 002 SQLite 执行 profile；也不要用复制后普通 readonly profiling或 Task 6 前后 stat 偷换计划规定的 immutable input 契约，除非先显式修订并重新批准权威计划。

### 首次后续门禁

- **Task 5：FAIL。** 一个 High actionable finding 未关闭。
- **Task 6：不允许进入。** 不授权 attempt 002 profile、三次 30 分钟 variant 或 analyze。即使后续 re-review PASS，“允许 Task 6”也不等于授权实际运行；仍需先确认本地 Java/MCP prerequisite 与明确运行授权。
- **OpenSpec：** 当前 finding 本身及“删除 fallback、保持 fail closed”的最小修复是对已批准计划的实现收口，不需要新增 proposal；diagnostic-only URI-capable 修复若只扩依赖/lockfile，需要先批准 Planned Files 扩围但通常不需要新 proposal。若解决方案改变公开 API、production SQLite driver、persistence lifecycle、formal evidence schema、生产行为或部署契约，则必须停止并重新评估 OpenSpec。
- **Superpowers plan：** 不需要新计划；应在当前 Task 5 scope 内修复、fresh 全量验证并再次 strict Review。若要放宽 `immutable=1` 明文要求，必须先修改并重新批准权威计划，不能由实现 Review 默许。
- **Dashboard：** 不得同步状态；本次未编辑 Dashboard。
- **Git/生产：** 不授权 commit、push、archive、merge、tag、cleanup、formal Gate D 或任何生产动作。
- **项目规则：** 未修改。

## 用户批准与修复迭代

1. 首次 strict Review 将 `better-sqlite3` URI 失败后退化为普通 readonly connection 判定为 High finding，并明确阻断 Task 6；该历史结论和依据完整保留在上文。
2. 用户随后明确批准仅限 diagnostic profiler 的 `/usr/bin/sqlite3` 扩展。批准边界是：固定绝对路径、一个 child/connection、`mode=ro&immutable=1`、无 shell/PATH/父进程环境、静态脚本、capability gate、严格协议、稳定脱敏；不扩展 production SQLite driver、公开 API、部署契约或持久化语义。
3. 修复后权威计划 SHA-256 为 `145d96eb924e1c8745b3abbc9f3e14255a7c6576078659a4477bce8a83f36e1b`；批准前置 Review SHA-256 为 `d1a06e2769683e984718e4a66932377e1e43035e62c55e557111628b371fe3dd`。
4. 本轮确认首次 High 已关闭：production profiler 不再包含 `better-sqlite3` URI/open 或普通 readonly fallback，只调用固定 `/usr/bin/sqlite3`。修复中一度存在的 Medium 风险“spawn seam 抛错时跳过 post identity”也已关闭：实现无论 child 返回失败还是 spawn seam 抛错，均先完成 main/WAL/SHM post `lstat` 与 replacement 判定，再返回固定失败类。

## Review 范围

### 最终权威制品

- 实际 dirty worktree：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `145d96eb924e1c8745b3abbc9f3e14255a7c6576078659a4477bce8a83f36e1b`
- 扩围前置 Review：[2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)，SHA-256 `d1a06e2769683e984718e4a66932377e1e43035e62c55e557111628b371fe3dd`
- profiler 实现：[gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)，SHA-256 `c44755955ab84ddd8b3d4e7758570a3e2ddd2768c0ae933ca98fb4cc378fbd80`
- profiler/final integration 测试：[gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)，SHA-256 `915ad46ffc8caf4c92b42255b6971288ae674516057b439a62fbca7220bd39a0`
- Runtime package manifest：[agent-runtime/package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)，SHA-256 `4c42dbb648f0c682b6c0b3de4d50e74450a02c764b6bae42febd2b943829e8a5`
- Workspace lockfile：[pnpm-lock.yaml](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/pnpm-lock.yaml)，SHA-256 `c0cbe7b6af5361203e87a38e768f0aa98fbbbfc118d9eed777fa018c85c7f356`

同时重新审阅了上文首次范围中的完整实际 source/test diff、identity propagation、formal/default behavior、runner/CLI/analyzer 边界以及受保护证据处理。`agent-runtime/package.json` 相对 HEAD 的唯一新增是既有 diagnostic CLI script；`pnpm-lock.yaml` 无 diff，与批准前置 Review 的 baseline 一致。

### 受保护既有证据最终状态

以下三份文件在本轮仍严格只执行 `git status` 与 `stat`；未读取内容、未计算文件 SHA、未打开、未写入、未移动、未删除。最终值与首次 Review 完全相同：

- [attempt 001 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/runtime.sqlite)：size `0`，mtime epoch `1784164996`，mode `-rw-------`
- [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)：size `1835978752`，mtime epoch `1784167299`，mode `-rw-------`
- [attempt 002 runtime.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite.lock)：size `0`，mtime epoch `1784165719`，mode `-rw-------`

未运行实际 profile、任何 30 分钟 variant、正式 Gate D、commit、push、archive、merge、tag 或 cleanup；未生成诊断 output。

## 主要发现

无 actionable finding。最终复审依据如下：

1. **固定单 child/connection 与真实 immutable URI**：production path 仅有一次固定 `/usr/bin/sqlite3` child 调用，参数为 `-batch`、`-bail` 和单个 percent-encoded `file:...?...mode=ro&immutable=1` URI；child 环境仅含固定 `LC_ALL=C`、`LANG=C`，不继承父环境，不使用 shell/PATH，不存在普通 readonly 或 native driver fallback。
2. **静态、聚合级 profiler**：脚本固定开启 `.bail`、JSON、`query_only`；先执行 SQLite version、JSON、`dbstat`、query-only、main-path capability gate，再输出 exact 五项 aggregates、delivery status distribution、object bytes 与三类 cardinality。七条 formal probes 加八条诊断 probes 共 exact `15` 个 ordered plan/timer block；scope IDs 只在各自 CTE 内使用，detail rows 通过 `.mode off` 抑制，不跨协议边界输出。
3. **严格协议与稳定脱敏**：parser 拒绝 CR、缺失/重复/乱序 marker、额外键、错误 aggregate/cardinality、错误 plan/timer 数量、trailing output、process error 与 capability mismatch；多行 JSON 与 timer stderr 均按固定语法绑定。失败统一为 `Gate D offline profiler failed`，不回显路径、SQL、child output、token 或其他敏感值。
4. **证据 identity fail closed**：打开前后对 main、WAL、SHM 执行 `lstat`，比较 exists/dev/ino/size/mtimeNs/ctimeNs；symlink、非普通文件、sidecar replacement 和 main replacement 均优先于 child/protocol failure 返回。spawn seam 抛错也不跳过 post identity。live-WAL 定向重放证明 ordinary readonly 可见 `2` 行，而 immutable URI child 只见 checkpoint 中 `1` 行，且 main/WAL/SHM 的 bytes、SHA-256 与完整 metadata 前后相等。
5. **identity 与 formal/default 非回归**：真实 child sentinel swap 在 storage open 前失败，sentinel bytes/SHA-256/size/mtime 不变；formal/normal production 默认不携带 identity，WAL、migration、integrity、reconciliation 等写能力仍位于 identity 校验之后。runner、CLI、analyzer 的 fixed workload、fresh/no-overwrite、local-only、cleanup、redaction 与 fail-closed 边界继续成立。
6. **批准范围未漂移**：计划、前置 Review、source、test 的 SHA 与给定批准链一致；manifest 仅有已批准 script，lockfile 无 diff；没有新增依赖、production driver 变更、部署契约变更、公共 API 变更或 Dashboard 状态变更。

## 精确命令结果（最终复审）

所有命令均在 [实际 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/) fresh 执行；无 sandbox `EPERM`，无需 escalated 重跑。

| 命令 | 结果 |
|---|---|
| `pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics` | PASS；1 file，159/159 tests |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakExecution` | PASS；1 file，44/44 tests |
| `pnpm --filter @openharness/agent-runtime test -- runtimeStorage` | PASS；1 file，8/8 tests |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakCli` | PASS；1 file，8/8 tests |
| `pnpm --filter @openharness/agent-runtime test` | PASS；75 files，615/615 tests；stderr 仅为既有 MCP 负向 fixture 的预期解析/脱敏日志 |
| `pnpm --filter @openharness/agent-runtime typecheck` | PASS；exit 0，无 type error |
| `pnpm --filter @openharness/agent-runtime exec vitest run test/gateDPerformanceDiagnostics.test.ts -t 'uses one fixed sqlite3 child and leaves a live WAL snapshot byte-for-byte unchanged' --reporter=verbose` | PASS；1/1，158 skipped；ordinary readonly=`2`、immutable URI=`1`；exact one `/usr/bin/sqlite3` child；main/WAL/SHM bytes、SHA-256、identity 与 metadata 前后全等 |
| `pnpm --filter @openharness/agent-runtime exec vitest run test/formalSoakExecution.test.ts -t 'fails an actual child storage open before a swapped sentinel database can be mutated' --reporter=verbose` | PASS；1/1，43 skipped；真实 child sentinel 的 bytes/SHA-256/size/mtime 全等 |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | PASS；`Change 'harden-agent-runtime-single-node-production' is valid` |
| `pnpm dashboard:check` | PASS；generated outputs current；未编辑 Dashboard |
| `git diff --check` | PASS；exit 0，无 whitespace error |
| fixed-child/URI/fallback scan | PASS；仅一个 production spawn、固定 `/usr/bin/sqlite3`、一个 immutable URI；无 `SQLITE_CANTOPEN`、`isSqliteCannotOpen`、`better-sqlite3 12`、compatibility fallback、plain readonly connection、shell 或 PATH |
| scoped sensitive/escalation scan | PASS with expected test/invariant literals only；未发现原始 secret、formal Gate D PASS 或 production fix/escalation claim |
| source/test/plan/Preflight SHA-256 recheck | PASS；分别为 `c44755955ab84ddd8b3d4e7758570a3e2ddd2768c0ae933ca98fb4cc378fbd80`、`915ad46ffc8caf4c92b42255b6971288ae674516057b439a62fbca7220bd39a0`、`145d96eb924e1c8745b3abbc9f3e14255a7c6576078659a4477bce8a83f36e1b`、`d1a06e2769683e984718e4a66932377e1e43035e62c55e557111628b371fe3dd` |
| `stat -f ...` 三份受保护 SQLite/lock | PASS；最终 size/mtime/mode 与首次 Review 一致；只执行 status/stat，未读内容 |

## 最终建议

1. 接受当前 Task 5 implementation closure，不需要继续修改 source/test；首次 High 与修复中 Medium 均已机械关闭。
2. 保持 fixed `/usr/bin/sqlite3`、single-child、immutable URI、strict protocol、pre/post identity 和稳定失败类不变；后续若修改这些边界，必须重新执行同等级 strict Review。
3. Task 6 运行前单独确认本机 Java/MCP prerequisite 与 `/usr/bin/sqlite3` capability，取得用户对实际读取 attempt 002、生成 profile 和执行三次 30 分钟 variant 的明确授权；本 Review 只证明实现可进入该授权门禁，不代替运行授权。

## 后续门禁

- **Task 5：PASS，允许收口。** 无 High/Medium/Low actionable finding。
- **Task 6：技术实现门禁通过，但实际执行仍未授权。** 不得在本 Review 下运行 attempt 002 profile、三次 30 分钟 variant、analyze 或正式 Gate D。
- **OpenSpec：** 无需新增 proposal；批准范围内的 diagnostic-only implementation 未改变 production SQLite driver、持久化生命周期、公开 API、部署契约或用户可见行为。
- **Superpowers plan：** 无需新增或修改实施计划；当前已批准计划 SHA 与实现一致。
- **Dashboard：** 无状态同步触发；本次未编辑 Dashboard。
- **Git/生产：** 不授权 commit、push、archive、merge、tag、cleanup、formal Gate D 或任何生产动作。
- **项目规则：** 未修改。
