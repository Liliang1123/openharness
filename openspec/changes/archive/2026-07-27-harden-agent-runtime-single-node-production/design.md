## Context

Agent Runtime 已具备完整 MVP 能力，但 durable lifecycle state 分散在 JSON 与进程内 store。平台能力继续扩展前，必须先形成可恢复、可审计、可压测的单机生产 v1。

已批准产品边界：Gate C 真实模型回归 **必选**官方本地 Codex CLI/app-server + ChatGPT/Codex OAuth（2026-07-15 批准 `adopt-codex-oauth-regression-qualification`）；Zhipu、OpenAI-compatible、Anthropic 和其他 API-key Provider 真实矩阵降为 advisory compatibility/optimization 证据，不否决 global model-regression PASS，也不得伪造其 row 结果；同时验收 Java sandbox 与 MCP；SQLite 为唯一持久化权威；Runtime 仅作为私有服务；容量门禁为 20 concurrent executions、10,000 conversations、24-hour soak。

## Goals / Non-Goals

### Goals

- 单 Runtime process/worker 的事务化 durable state 与确定性恢复。
- 真实 Provider/工具的独立、可审计资格矩阵。
- 有固定 oracle 的 Runtime 稳定性 soak。
- 通过后冻结 Runtime v1 service/persistence contract。

### Non-Goals

- 多进程/多节点、分布式锁、PostgreSQL。
- 平台登录、用户/租户管理、模型配置 UI。
- 重启后续跑 runner 或恢复未完成外部副作用。
- Java Gateway 重启后的 exactly-once；首版 soak 仅重启 TS Runtime。

## Decisions

### Decision 1: One process, one SQLite authority

生产 profile 仅允许一个 Runtime process/worker。进程必须在打开数据库和通过 readiness 前获取数据库旁的独占 OS advisory lock；第二实例获取失败即保持 unready 并退出。锁由 OS file descriptor 持有，进程死亡自动释放，不使用基于时间的 stale-owner 猜测。SQLite 是 cutover 后唯一写权威，启用 WAL、foreign keys。生命周期写事务使用 `BEGIN IMMEDIATE`；不使用全局 `EXCLUSIVE`。每次 Unit of Work 共享一个 5 秒 wall-clock contention deadline；每次 attempt 的 `busy_timeout` 等于剩余 budget，并在 budget 内最多 3 次 bounded backoff，绝不叠加成 15 秒。deadline 耗尽后 fail closed。

WAL 每 1,000 pages 自动 checkpoint；每 60 秒检查一次 WAL 与磁盘。WAL 达 256 MiB 时尝试 `TRUNCATE` checkpoint；reader 导致 BUSY 时记录告警、停止新 admission 并按 deadline 重试，不承诺同步截断。可用磁盘低于 2 GiB 或 10%（取较大值）时停止新 execution/external mutation admission，但为已接受 execution 预留 512 MiB emergency headroom 以提交 tool result/terminal state。低于 512 MiB 或 2%（取较大值）时进入 critical drain：继续拒绝外部 mutation，只允许预留空间内的内部 terminal/reconciliation writes，尽力原子标记在途 execution 后退出；未提交状态由下次 startup reconciliation 收敛。

### Decision 2: Lifecycle Unit of Work

Store interface 保持分离，但所有跨 store lifecycle transition 必须经 `RuntimeStorage.transaction(tx => ...)`。Repository 不得自行开启不相关事务。以下为最小原子边界：

1. execution create + stable user message + `agent_start` event；
2. approval record + `waiting_approval` state + `approval_requested` event；
3. approval decision compare-and-set + decision event；
4. completed tool result stable message + `tool_result` event；
5. model response containing tool calls + `model_call_end/tool_call` events，标记为 execution-owned provisional context；
6. final assistant message + terminal state + `final_answer/agent_end/stream_done` durable events；
7. interrupted reconciliation + provisional-context exclusion + approval invalidation + terminal event。

Live SSE 可发布显式 transient preview；durable lifecycle event 只能在 commit 后发布。Post-commit notifier 失败不得回滚事务，客户端通过 durable replay 补齐。`runtime_events` 同时充当 Java trace/audit outbox，保存 delivery status、attempt count 与 next-attempt；dispatcher 重启续传，Java 按 committed event identity 幂等接收。`pending/retry` row 禁止 retention prune；ack 后才进入普通 retention。达到最大重试的 row 进入 durable dead-letter、触发 readiness degradation 和人工告警，不得静默删除。

### Decision 3: Restart terminates unfinished continuations

启动在 readiness 前执行 migration、integrity check 与 reconciliation。`running` 和 `waiting_approval` 一律原子转为 `errored/EXECUTION_INTERRUPTED`；pending approval 变为 `invalidated`。不重建 runner，不接受旧 approval decision，不重放 model/tool side effects。Terminal execution 保持 terminal。

Java approval token 属于 secret：仅存于当前进程内存；SQLite 只保存 HMAC-SHA-256 digest、TTL 与 single-use 状态，raw token 不进入 runtime event、API response、trace 或日志。客户端只收到非敏感 `approvalId`，并通过已认证、tenant+user scoped CAS endpoint 提交决定；Runtime 在内存中解析对应 Java token。进程重启后旧 approvalId/token 必然失效。

### Decision 4: Streaming fragments are transient

Provider streaming fragments 使用 `preview_delta` transient envelope，只存在于主 HTTP stream 内存，不写 SQLite、不分配 durable `eventId`，仅带 connection-local `previewSeq`。Session replay 永不包含 preview。最终 assistant message 与 terminal durable events 在一个 Unit of Work 中提交后才成为 stable/replayable state。若进程中断，preview 被丢弃，execution 变为 `EXECUTION_INTERRUPTED`，重连客户端收到 terminal 状态并显式重试。

### Decision 5: Durable cursor and tenant scope

Durable event key 为 `(tenant_id, user_id, conversation_id, seq)`；seq 分配与 event insert 同事务。cursor 为 opaque token，禁止跨 scope 使用。Prune 保留 low/high watermark；低于 low watermark、未知 cursor 或删除后重建的 conversation 均返回 `stream_resync_required`。单连接内 committed events 无 gap/duplicate；跨重连为 at-least-once，客户端按 opaque event identity 去重。Replay watermark 与 post-commit subscription 保证切换时不漏 committed event。

### Decision 6: Trusted service authentication

生产 profile 使用可轮换 service bearer token（部署 secret，constant-time compare）认证平台网关；后续可替换 mTLS/JWT，但不改变 identity contract。所有 business route 在读取 tenant state 前统一认证并要求 tenant/user/trace/request headers；生产禁止 default tenant/user。Body/query 不得覆盖 identity。conversation/execution/approval/event 使用 tenant+user ownership scope，memory 使用 tenant+user scope，并覆盖同 tenant 跨 user 与跨 tenant IDOR 负例。

### Decision 7: JSON import and forward-only cutover

导入前备份并记录 hash。每个 JSON 文件先经现行 Zod/schema 校验；损坏记录移入只读 quarantine manifest（原文件保留，manifest 仅记录 path/hash/error，不复制原文或 secret），主体迁移继续。重复导入不重复有效数据或 quarantine item。Quarantine 非空时自动 cutover 必须停止，只有人工明确接受数据缺口后才能继续。

首次 SQLite write 前允许恢复 JSON backup 与旧 binary。首次 write 后采用 forward-fix only，不支持旧 binary 回滚；人工 cutover gate 必须确认备份、import report、quarantine、restore rehearsal 和 30 分钟 RTO/最近成功备份 RPO。Schema migration 禁止 destructive downgrade。

### Decision 8: Qualification is split

真实 Provider/工具资格矩阵与 24 小时 Runtime soak 分离，避免用付费/不稳定下游污染 Runtime 稳定性结论。

资格验证同时采用本地与生产双轨状态。`local_verified` 允许在 Gate B 生产证据仍待补齐时继续 deterministic SQLite、fake Provider、真实本地 Java sandbox 与真实本地 MCP stdio 子进程链路；它只证明本地开发链路，不得转换为生产结论。`production_verified` 仍要求生产 migration/cutover 证据、真实 Provider、生产部署与正式 soak。Gate B 保持 `pending_production_evidence` 时，禁止首次生产 SQLite write、生产数据、生产 Provider credential 与任何生产 promotion，但不阻塞本地限定的 Task 9–12。

Real matrix 每个 provider/tool case 记录 environment fingerprint、协议版本、model/tool capability、redacted request hash、observed response/event sequence、oracle、usage/cost、duration 和 result。必选 Codex OAuth track 缺登录、缺 transport、mock/fallback、任一 required row FAIL/BLOCKED 或证据绑定失败时，model-provider gate 不得 PASS。API-key Provider 缺凭证或 capability 时保留真实 `BLOCKED`/`FAIL` 作为 advisory finding，不否决 global model-regression PASS；只有各自 dedicated real matrix PASS 才能声明该协议 production-qualified。统一 redaction interceptor 覆盖 Runtime/Backend stdout、file log、trace 与 failure report，并用 Authorization、`sk-` canary 做负向扫描。

### Decision 9: Fixed soak oracle

Soak 使用 deterministic local provider/tool fixtures，Java Gateway 全程保持运行，只在 2h、12h、22h 重启 TS Runtime。固定负载：10,000 seeded conversations；20 concurrent executions；60% no-tool、20% Java sandbox、15% MCP、5% approval/interruption；30 秒采样。

Hard fail（立即停止）：任何 cross-scope leak、duplicate Runtime-caused side effect、SQLite integrity failure、duplicate durable row/sequence、单连接重复或顺序错误、secret leak、unexpected process exit、无法 reconciliation、耗尽重试后的 `SQLITE_BUSY`。跨重连以同一 eventId 合法重投不算 duplicate failure。

Performance/resource gate：Runtime admission p95 ≤100ms、durable replay p95 ≤250ms（均排除 provider/tool latency）；RSS ≤1.5GiB；open FD ≤1,024；WAL checkpoint 后 ≤256MiB；MCP child count 不超过配置数；warm-up 后首尾各 2 小时 median RSS/FD 增长 ≤10%。任一性能阈值连续 5 分钟超限即 FAIL。环境 fingerprint 与完整采样写入固定 report schema，阈值不得在 run 后放宽。

### Decision 10: Dedicated asynchronous SQLite storage worker

Gate D mature workload 的 correctness 保持 clean，但 durable admission 出现持续尾延迟。R6–R9 已排除 page cache/mmap、lifecycle transaction batching、独立 PASSIVE checkpoint worker 和隔离 trace-transition chunking 作为充分修复；其中 Gate R9 candidate 虽把隔离 admission p95 改善 `62.188%`，control 却没有复现任何 `>100ms` 样本，因此不得实施或外推。后续不再以单变量 SQLite pragma/transaction 微调替代架构恢复。

生产 profile 保持一个 Runtime process、一个 SQLite 文件、一个 singleton lock 和一个 durable write authority。主线程持有 singleton lock、HTTP/SSE、Agent Loop、Java/MCP 网络 I/O 与 transient live publisher；一个 dedicated Node Worker Thread 独占 `better-sqlite3` connection，并在该线程内执行 migration、identity/integrity verification、startup reconciliation、所有 lifecycle Unit of Work、scoped history/memory/execution/approval/event queries、trace outbox claim/status/outcome transition、WAL/checkpoint/monitor database operations 和最终 close。

主线程与 worker 只交换 typed semantic command/response DTO。禁止跨线程传递 raw SQL、transaction callback、repository/SQLite handle 或可执行代码。Lifecycle command 在 worker 内保持现有原子边界；worker 只在 COMMIT 成功后返回 `LifecycleCommit.events`，主线程收到成功响应后才发布 durable SSE。Caller timeout/abort 不得撤销已经开始的 durable command；结果可被 caller 丢弃，但 transaction 必须确定性 commit 或 rollback。

Worker client 使用单一有界调度器：

1. P0 exclusive：bootstrap migration/integrity/reconciliation、critical drain、checkpointed shutdown；
2. P1 foreground：execution admission、approval、已接受 execution 的 lifecycle transitions 与 authenticated scoped reads/mutations；
3. P2 background：trace outbox claim/status/outcome、retention、WAL/monitor maintenance。

队列最多容纳 `2,048` 个 pending commands。P0 进入 exclusive lifecycle 时不接受普通 command。正常运行优先 P1，但连续选择 `32` 个 P1 后，若 P2 已等待则必须选择一个 P2；正在执行的 SQLite transaction 不抢占。队列饱和时复用现有 storage-pressure `503` fail-closed response schema，停止新 execution/external mutation admission，已接受 execution 的 terminal work 仍按现有 emergency-headroom policy 尝试完成。不得通过无界 queue、丢弃 command 或绕过 durable start 来降低表面 latency。

Java trace delivery继续在主线程按现有 `batchSize=100`、`deliveryConcurrency=20` 执行。Outbox claim 与每批 delivered/retry/dead-letter outcomes 作为 semantic commands 进入 worker，保留当前 whole-batch outcome transaction；Gate R9 被拒绝的 20-row chunk commit/crash boundary 不进入 production。

Singleton lock 在 worker bootstrap 前获取，并保持到 worker 完成 checkpoint/close 后才释放。Runtime readiness 必须等待 worker 完成 database identity verification、migration、integrity 和 reconciliation。Worker unexpected exit 或 protocol corruption 时，client 原子进入 unavailable，拒绝所有 pending/new storage commands，readiness 变 false，停止新 admission 并终止 Runtime process；禁止在同一进程内 replacement worker 或打开第二 SQLite connection。下次正常进程启动重新获取 singleton lock，并按 Decision 3 reconciliation。

正常关闭顺序固定为：停止外部 admission → critical drain/等待已接受 lifecycle commands → 停止 trace dispatcher/maintenance enqueue → worker `TRUNCATE` checkpoint 与 close → terminate/join worker → release singleton lock。Schema、database path、backup/import/cutover、5 秒 contention deadline、WAL/disk thresholds、public API/SSE、tenant/user isolation、cursor、approval secret、outbox retry/dead-letter 和 fixed Gate D thresholds 均不改变。

### Decision 11: Local trial precedes deferred production qualification

2026-07-27 用户决定先自行试用并以真实反馈持续打磨 Runtime，不再执行当前准备的 24 小时 Gate D Attempt005。该决定将当前 adoption state 定义为 `Local Trial Ready`：dedicated Worker 实现、完整本地回归、成熟数据库 10 分钟回归、安全、恢复与运维证据足以支持项目所有者本地试用。

正式 Gate D 保留为未来 `Production Verified` 的 promotion gate，但状态为 user-deferred。延期不等于 PASS、FAIL、删除门禁或阈值放宽；不得勾选未执行的 production tasks、标记 Dashboard `verified`、冻结 production contract、完成 closeout 或 archive。若以后恢复生产资格，必须使用新的明确恢复决定、新 runId、fresh no-overwrite packet、active preflight 和独立 start/promotion approval，继续遵守 Decision 9 的 workload、restart、threshold 与 oracle。

本地试用反馈进入后续独立优化 backlog。任何运行时语义、API、持久化、安全或性能架构变更仍需按 OpenSpec/TDD/Review 门禁实施；试用授权本身不扩大生产、Git 或发布权限。

## Real Qualification Matrix

### Providers

官方本地 Codex CLI/app-server + ChatGPT/Codex OAuth 是 **Gate C 必选**真实模型 family。固定 required production rows 为 `codex-real-sync`、`codex-real-reasoning`、`codex-real-usage`、`codex-real-stream`、`codex-real-cancellation`、`codex-real-redaction`；必须全部 required/PASS，并通过 authorized production track、immutable report SHA、当前 client source SHA、`provider=codex-app-server`、`qualificationAuthorization=granted`、`credentialState=not-read` 与 redaction/no-fallback 复核。OpenHarness 不读取 OAuth credential，也不在 required 失败时 fallback 到 API-key 或 mock。

Zhipu、generic OpenAI-compatible、Anthropic 和其他 API-key Provider 保留现有 adapters、fake/local tests、real runners 和 immutable reports。其真实 rows 保留 observed PASS/FAIL/BLOCKED，但在 global Runtime qualification 中为 `required:false` 或在 required aggregate 外以 advisory report 引用。缺/过期 API key、provider-specific fixture 不可用、unsupported capability、FAIL 或 BLOCKED 只形成 compatibility/optimization finding；Codex PASS 不得推断任何第三方协议已 production-qualified。

### Tools

Java sandbox 必须记录 sandbox implementation，并覆盖 read/search/run-command containment、output cap、timeout、policy、audit、idempotency。MCP 使用真实 stdio test server，覆盖 initialize、tools/list、catalog conflict、multi-step call、provenance、approval、timeout/crash isolation、cancel capability 和 SIGTERM shutdown。Unsupported required capability 为 BLOCKED，不得 skip 后 PASS。

## Verification And Promotion

Stage 1：migration/import/quarantine、Unit of Work crash matrix、restart reconciliation、cursor/IDOR、WAL/low-disk tests。Dedicated storage worker 还必须通过 typed protocol、2,048 queue bound、P0/P1/P2 ordering/fairness、commit-before-publish、worker before/after-commit crash、unexpected-exit fail-closed、shutdown/join 和 event-loop heartbeat tests。fixture/local 证据可进入 `local_verified`；生产 migration rehearsal 未完成时 Gate B 保持 pending。

Stage 2：先运行 fake Provider、真实本地 backend sandbox、真实本地 MCP qualification matrix 与 secret canary/redaction，形成 `local_verified`；Gate C model-provider portion 由 authorized immutable Codex OAuth production report 及 no-overwrite decision artifact 单独复核。API-key real matrices 仅在独立授权时运行，并保持 advisory。

Stage 3：storage worker 实施后先运行完整 TypeScript/Java/Integration/OpenSpec/Dashboard 验证和现有成熟数据库 10 分钟回归；只有原 admission/replay/correctness/resource thresholds 通过才允许创建 Attempt005 packet。上述本地证据已通过，因此 Runtime 可进入 `Local Trial Ready`。2026-07-27 用户将 Attempt005 与后续 production qualification 延期；固定 24-hour soak、生产 backup/restore rehearsal、全仓 production qualification 和最终 freeze 只有在未来明确恢复 `Production Verified` 路径后才继续。`local_verified` 或 `Local Trial Ready` 均不得标记 Gate B/C/D 通过、dashboard verified、OpenSpec complete 或 archive。
