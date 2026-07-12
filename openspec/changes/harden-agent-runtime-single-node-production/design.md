## Context

Agent Runtime 已具备完整 MVP 能力，但 durable lifecycle state 分散在 JSON 与进程内 store。平台能力继续扩展前，必须先形成可恢复、可审计、可压测的单机生产 v1。

已批准产品边界：Gate C 真实 Provider **必选** OpenAI-compatible；Anthropic 真实矩阵 **后置（deferred / post-Gate-C，2026-07-09 批准 `defer-anthropic-from-gate-c`）**，缺 Anthropic key 不得单独阻塞 Gate C；同时验收 Java sandbox 与 MCP；SQLite 为唯一持久化权威；Runtime 仅作为私有服务；容量门禁为 20 concurrent executions、10,000 conversations、24-hour soak。

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

Real matrix 每个 provider/tool case 记录 environment fingerprint、协议版本、model/tool capability、redacted request hash、observed response/event sequence、oracle、usage/cost、duration 和 result。缺凭证或必需 capability 为 `BLOCKED`，整体验收不得 PASS；不得 mock fallback。统一 redaction interceptor 覆盖 Runtime/Backend stdout、file log、trace 与 failure report，并用 Authorization、`sk-` canary 做负向扫描。

### Decision 9: Fixed soak oracle

Soak 使用 deterministic local provider/tool fixtures，Java Gateway 全程保持运行，只在 2h、12h、22h 重启 TS Runtime。固定负载：10,000 seeded conversations；20 concurrent executions；60% no-tool、20% Java sandbox、15% MCP、5% approval/interruption；30 秒采样。

Hard fail（立即停止）：任何 cross-scope leak、duplicate Runtime-caused side effect、SQLite integrity failure、duplicate durable row/sequence、单连接重复或顺序错误、secret leak、unexpected process exit、无法 reconciliation、耗尽重试后的 `SQLITE_BUSY`。跨重连以同一 eventId 合法重投不算 duplicate failure。

Performance/resource gate：Runtime admission p95 ≤100ms、durable replay p95 ≤250ms（均排除 provider/tool latency）；RSS ≤1.5GiB；open FD ≤1,024；WAL checkpoint 后 ≤256MiB；MCP child count 不超过配置数；warm-up 后首尾各 2 小时 median RSS/FD 增长 ≤10%。任一性能阈值连续 5 分钟超限即 FAIL。环境 fingerprint 与完整采样写入固定 report schema，阈值不得在 run 后放宽。

## Real Qualification Matrix

### Providers

OpenAI-compatible 固定为 Chat Completions-compatible endpoint 与记录的 API/model version，是 **Gate C 必选** 真实 Provider family：覆盖 sync、stream、single/multi-step tool calls、structured arguments、reasoning（能力支持时必须验证，否则该 model 不合格）、usage token 对账（provider response 精确相等）、cost 按配置公式精确复算、503 retry、timeout、cancel、terminal error 与 redaction。缺 OpenAI-compatible 凭证或任一 required row FAIL/BLOCKED 时 Gate C 不得 PASS。

Anthropic 固定为 Messages API 与记录的 `anthropic-version`，能力矩阵口径与上相同，但真实 credential matrix 为 **deferred / post-Gate-C**：可继续跑 local/fake Anthropic 证据；缺 Anthropic 凭证不得单独将 Gate C 判为 blocked。OpenAI-compatible 成功不得推断 Anthropic 已 production-qualified；Anthropic 仅在后续独立真实矩阵 PASS 后才可额外晋升。

### Tools

Java sandbox 必须记录 sandbox implementation，并覆盖 read/search/run-command containment、output cap、timeout、policy、audit、idempotency。MCP 使用真实 stdio test server，覆盖 initialize、tools/list、catalog conflict、multi-step call、provenance、approval、timeout/crash isolation、cancel capability 和 SIGTERM shutdown。Unsupported required capability 为 BLOCKED，不得 skip 后 PASS。

## Verification And Promotion

Stage 1：migration/import/quarantine、Unit of Work crash matrix、restart reconciliation、cursor/IDOR、WAL/low-disk tests。fixture/local 证据可进入 `local_verified`；生产 migration rehearsal 未完成时 Gate B 保持 pending。

Stage 2：先运行 fake Provider、真实本地 backend sandbox、真实本地 MCP qualification matrix 与 secret canary/redaction，形成 `local_verified`；真实 Provider credential matrix 仍由 Gate C 单独授权。

Stage 3：本地仅允许 deterministic short baseline；固定 24-hour soak、生产 backup/restore rehearsal、全仓 production qualification 和最终 freeze 仍需独立人工 promotion。`local_verified` 不得标记 Gate B/C/D 通过、dashboard verified、OpenSpec complete 或 archive。
