# Agent Runtime 性能恢复与生产闭环实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 串行执行，并对每个行为变更严格执行 `superpowers:test-driven-development` 的 RED → GREEN → REFACTOR。不得重复既有三组 30 分钟 Gate R1 workload 或两个定向微基准。

**目标：** 在既有 OpenSpec change `harden-agent-runtime-single-node-production` 内修复 session replay 放大、durable trace outbox 生命周期缺口和正式数据库 oracle 全表增长，使 Runtime 具备可启动、可回放、可持续投递、可降级 readiness、可验证的单节点生产闭环。

**依据：**

- [Gate R1 最终诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-gate-r1-final-diagnosis-review.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Agent Runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 固定边界

- 本轮只在 [isolated worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/) 修改；不编辑主 checkout。
- 保留所有既有 Gate R1 SQLite、report、decision、日志和定向诊断证据；不得重跑、覆盖、迁移或“刷新”这些历史输入。
- 不改变外部 Agent API、tenant/user scope、approval 语义、retention 规则、Provider 契约或 Gate D 阈值。
- `runtime_events` 的 replay 数据与 Java trace outbox 共表，但只有 `kind = 'trace'` 的 committed event 才是 Java delivery candidate；其他 event 必须显式标记为不适用，不能占据 pending/retry 队列。
- dead-letter 必须持久化并使 authenticated readiness 返回非 ready；retry 中的暂时 Java 故障不得提前降级 readiness。
- 正式 Gate D 仍固定 24 小时、10,000 seeded conversations、20 concurrency、2h/12h/22h restart。此次实现不得以短测替代正式 Gate D。
- 不执行 Git commit、push、merge、tag，不归档 OpenSpec，不把 active change 标为完成。

## Task 1：session detail 单次 durable replay

**文件：**

- 修改 [sessions API tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sessionsApi.test.ts)
- 修改 [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)

### RED

新增一个带计数代理的 `RuntimeEventStore` 测试：

1. 为同一 scope 建立 history、active execution 和可派生 progress 的 durable events；
2. 对 `GET /api/v1/sessions/:conversationId` 发起一次请求；
3. 断言响应仍包含正确 `runtimeProgress`；
4. 断言同一请求只调用一次 `runtimeEventStore.since(..., null)`。

先只运行该测试并保留预期失败：当前实现应观测到两次调用。

### GREEN

让 `progressForSession()` 接收 route 已读取的 `readonly SessionEvent[]`，不再自行访问 store；route 同一份 `scopedEvents` 同时用于 existence、execution 选择和 progress 派生。

### 验证

```bash
pnpm --filter @openharness/agent-runtime test -- sessionsApi.test.ts
```

## Task 2：schema v2 与 trace-only due outbox

**文件：**

- 修改 [runtime storage schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- 修改 [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- 修改 [runtime storage tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorage.test.ts)
- 修改 [SQLite Runtime event store tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sqliteRuntimeEventStore.test.ts)

### RED

先增加失败测试，证明：

1. 新数据库按顺序记录 schema versions `1, 2`，重复 migrate 幂等；
2. 从 v1 fixture 迁移时，非 trace 的 `pending/retry` 记录变为 `not_applicable`，trace 记录保持可投递；
3. 新 append 的非 trace event 初始为 `not_applicable`，trace event 初始为 `pending`；
4. `claimOutbox(now, limit)` 只返回 `kind = 'trace'`，只返回 pending 或已到期 retry，并稳定按 `created_at,event_id` 排序；
5. 大量更早的非 trace 记录不能饿死 trace；
6. `EXPLAIN QUERY PLAN` 使用 trace-only ordered partial index，不为 claim order 创建临时 B-tree；
7. dead-letter readiness 查询有匹配 partial index。

### GREEN

将 migration runner 改为有序 migration 列表：

- v1 保留历史初始 schema；
- v2 在单个 `BEGIN IMMEDIATE` transaction 内：
  - 把非 trace `pending/retry` 更新为 `not_applicable`，清空 `next_attempt_at`；
  - 删除旧 `runtime_event_outbox` index；
  - 创建按 `created_at,event_id` 排序、仅覆盖 trace pending/retry 的 partial index；
  - 创建 trace dead-letter partial index；
  - 记录 schema version 2。

新 schema 默认 delivery 状态为 `not_applicable`。`append()` 显式写入 trace 的 `pending` 或其他 event 的 `not_applicable`。`claimOutbox()` 接收当前时间并在 SQL 内完成 kind、状态、due time、order 和 limit 过滤。

### 验证

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorage.test.ts sqliteRuntimeEventStore.test.ts
```

## Task 3：并发 trace batch、身份绑定与 retry 原子状态

**文件：**

- 修改 [trace outbox batch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- 修改 [trace outbox tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)

### RED

先增加失败测试，证明：

1. batch 不再依赖固定 identity headers，而是为每条 event 生成 `Authorization` 与该 event 自身的 tenant/user/trace/request headers；
2. service token 不出现在 event payload、结果或错误；
3. 至多使用固定有界并发数投递 Java，全部 Promise settle 后再返回；
4. due retry 恢复投递，future retry 不被 claim；
5. acknowledgment、retry、dead-letter 只在当前 pending/retry row 上转换；
6. batch 结果包含 `processed` 数，供 dispatcher 判断是否立即续批；
7. 单条失败不阻断同批其他候选，max attempts 后 durable dead-letter 并置 `readinessDegraded = true`。

### GREEN

- `dispatchTraceOutboxBatch()` 接收 `headersFor(event)` callback，不持有或返回 raw token。
- 候选在 SQL claim 时已完成 due/trace 过滤。
- 使用小型通用 bounded worker loop，默认 batch `100`、delivery concurrency `20`；拒绝非正整数配置。
- 每个 event 的状态读取与最终 transition 保持 scoped identity；Java HTTP 可并发，SQLite transaction 仍由单 Node worker 串行提交。
- result 增加 `processed`，其余 delivered/retried/deadLettered/readinessDegraded 保持明确。

### 验证

```bash
pnpm --filter @openharness/agent-runtime test -- traceOutbox.test.ts sqliteRuntimeEventStore.test.ts
```

## Task 4：生产 dispatcher 生命周期与 fail-closed readiness

**文件：**

- 新增 [trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- 新增 [trace outbox dispatcher tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutboxDispatcher.test.ts)
- 修改 [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- 修改 [production server lifecycle tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionServerLifecycle.test.ts)
- 修改 [Gate D formal execution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)
- 修改 [Gate D formal execution tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/formalSoakExecution.test.ts)

### RED

先增加 deterministic scheduler 测试，证明：

1. `start()` 立即尝试派发，满批时零延迟续批，空批或 transient error 时按固定 interval 重试；
2. 同一 dispatcher 永不重叠执行两个 batch；
3. `close()` 等待在途 batch settle、取消后续 schedule，重复 close 幂等；
4. 启动时数据库若已有 trace dead-letter，readiness 立即 degraded；
5. 新 dead-letter 同样持久降级，普通 retry 不降级；
6. 生产 server 创建一个共享 `JavaClient`，同时供 request path 与 dispatcher 使用；
7. production app close 先停止 dispatcher，再关闭 SQLite context；创建失败与 listen 失败仍释放 lock；
8. authenticated `GET /api/v1/health/ready` 在健康时返回 200，在 dead-letter 时返回 503；业务认证和 identity headers 规则不弱化；
9. Gate D supervisor 改用该 readiness endpoint，401/403 仍 fail closed。

### GREEN

实现单 owner `TraceOutboxDispatcher`：

- 默认 batch size `100`、delivery concurrency `20`、idle retry `250ms`、max attempts `5`、retry delay `1s`；
- scheduler 与 clock 可注入，生产使用 `setTimeout`；
- readiness 初值由 indexed dead-letter existence query决定，运行期 dead-letter 只能把状态变为 degraded；
- `createProductionServer()` 只实例化一次 `HttpJavaClient`，构造 event-scoped headers callback，创建 app 后启动 dispatcher；
- onClose 顺序固定为 dispatcher → MCP/app hooks → context，并确保异常路径同样关闭；
- `createServer()` 新增只读 readiness provider 和 authenticated readiness route；development 默认 ready。

### 验证

```bash
pnpm --filter @openharness/agent-runtime test -- traceOutboxDispatcher.test.ts productionServerLifecycle.test.ts formalSoakExecution.test.ts
```

## Task 5：正式 oracle 等价增量化

**文件：**

- 修改 [Gate D formal execution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)
- 修改 [Gate D formal execution tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/formalSoakExecution.test.ts)
- 按需要修改 [Gate D performance diagnostics tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)，但不得改变历史 diagnostic full/incremental variant 语义

### RED

增加 `formal-incremental` mode 的失败测试：

1. 正式 executor 明确构造 `GateDDatabaseObservationCursor({ mode: "formal-incremental" })`；
2. 每个 sample 仍产生原有七个 probe timing 名称；
3. runtime event ordering、dead-letter、orphaned approval、duplicate durable identity、SQLite busy exhaustion、event secret canary 和 message secret canary 的 hard-failure 分类保持不变；
4. runtime event、busy 与 event canary 只扫描 `rowid > lastEventRowId`；
5. message canary 只扫描 `rowid > lastMessageRowId`；
6. duplicate event/cursor 由 schema unique constraints 加本 cursor 的跨 sample monotonic/in-batch identity checks等价覆盖，不再执行全表 `GROUP BY ... HAVING`；
7. SQL 捕获断言不存在未绑定 rowid 的 payload `LIKE` 或 runtime_events 全表 duplicate aggregation；
8. `formal-full` 与 `diagnostic-incremental` 历史模式仍可用于既有诊断读取，不被静默改义。

### GREEN

- 扩展 cursor mode 为 `formal-full | formal-incremental | diagnostic-incremental`。
- 分开保存 event 与 message watermarks；先查询增量范围，处理完才推进对应 watermark。
- formal-incremental 保留七个 timing probe；in-memory/constraint-backed duplicate check 仍记录 `duplicate-event` timing，但不发出伪造 SQL。
- dead-letter 使用新 partial index；orphaned approval 保持 scoped join query。
- 正式 executor 固定使用 formal-incremental；历史 diagnostic runner 显式 mode 保持不变。

### 验证

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakExecution.test.ts gateDPerformanceDiagnostics.test.ts
```

## Task 6：聚焦回归、全量回归与静态门禁

按顺序运行，任何失败先进入 `superpowers:systematic-debugging`，不得跳到长回归：

```bash
pnpm --filter @openharness/agent-runtime test -- sessionsApi.test.ts runtimeStorage.test.ts sqliteRuntimeEventStore.test.ts traceOutbox.test.ts traceOutboxDispatcher.test.ts productionServerLifecycle.test.ts formalSoakExecution.test.ts gateDPerformanceDiagnostics.test.ts
pnpm test
pnpm typecheck
mvn -o -f backend/pom.xml clean test
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
```

在不修改历史证据的前提下，额外对 [Gate R1 incremental SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-incremental-001.sqlite) 做一次 production-sized migration rehearsal：

1. 记录原始文件 inode、size、mtime 与 sidecar 状态；
2. 在 `mktemp -d /private/tmp/openharness-runtime-v2-migration.XXXXXX` 精确目录内创建 APFS clone，mode 保持 `0600`；
3. 只对 clone 执行 v1 → v2 migration，记录 wall-clock duration；
4. 验证 schema versions、trace/non-trace 状态迁移、claim/dead-letter query plan、`PRAGMA integrity_check = ok`；
5. 关闭所有 descriptor 后复核原始文件元数据和 sidecar 状态完全不变；
6. 将精确临时目录移动到当前用户 Trash 以便恢复，不递归删除、不保留在项目目录。

附加静态门禁：

- production server/context 必须 import 并拥有 dispatcher；
- `progressForSession` 不得调用 `RuntimeEventStore.since`；
- outbox claim SQL 必须在数据库层限定 trace/due；
- 正式 executor 不得使用默认 `new GateDDatabaseObservationCursor()`；
- 源码、tests、docs diff 不得包含真实 token、Bearer secret 或 evidence payload；
- 当前实现 diff 只包含本计划范围与此前已落盘诊断制品。

## Task 7：实现 Review 与 60 分钟恢复回归准入

使用 `superpowers:requesting-code-review` 执行独立于编码步骤的 High Review，并落盘：

- [performance recovery implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-performance-recovery-implementation-review.md)

Review 至少覆盖：

- `结论`、`Review 范围`、按严重度的 `主要发现`、`最终建议`、`后续门禁`；
- API/scope/auth 不回退；
- migration v1 → v2 原子且可在 production-sized clone 上前向执行；
- outbox 不饿死、dispatcher 有界且 close/readiness fail closed；
- formal-incremental oracle 与原 hard-failure 语义等价；
- fresh focused/full/typecheck/backend/OpenSpec/dashboard evidence。

只有 Review 为“通过”且没有 Critical/Important 未解决项，才能另建固定 60 分钟恢复回归执行计划与 preflight Review。该回归是 Gate D 前的本地准入，不得晋升为 24 小时 Gate D PASS。

## 完成标准

- 五个 TDD 切片均有先失败后通过的可复核测试；
- fresh Runtime 全量 tests、workspace tests、typecheck、backend、OpenSpec strict、Dashboard check 全部通过；
- production Runtime 具备 trace outbox dispatcher、dead-letter readiness degradation 和 clean close；
- session detail 每请求只做一次 scoped durable replay；
- production formal oracle 不再随全库 event/message 历史做重复全表 scan；
- implementation Review 通过；
- 未执行历史诊断、60 分钟回归、24 小时 Gate D、OpenSpec archive、Dashboard verified sync 或 Git 发布动作。
