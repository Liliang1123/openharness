# Agent Runtime Single-Node Production Proposal Review

## 结论

通过：初审时两名独立 reviewer 均给出 `BLOCK`；proposal 随后经过六轮修订与复审，所有 Critical、Important 和 Minor findings 均已关闭。最终架构 reviewer 与契约 reviewer 均给出 `PASS`，OpenSpec strict validation 与 dashboard check 通过。该 proposal 已具备人工批准条件；批准前仍不得生成实施计划或开始代码实现。

## 最终复审收口

- 架构 reviewer：`PASS`，无 remaining findings。
- 契约/验收 reviewer：`PASS`，无 remaining findings。
- 已关闭：restart interruption、Lifecycle Unit of Work、forward-fix cutover、provider/MCP/sandbox evidence matrix、fixed soak oracle、service auth/IDOR、stream durable/transient union、approvalId secret boundary、tenant+user ownership、singleton fencing、outbox/dead-letter、WAL/low-disk、shared terminal schema、Frontend/shared-schema implementation checklist。
- 本文“主要发现”保留初审历史，最终状态以本节和“结论”为准。

## Review 范围

### 待评审制品

- [产品设计](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/specs/2026-07-03-agent-runtime-single-node-production-design.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Agent Runtime delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [Backend Gateway delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/backend-gateway/spec.md)
- [Message History delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/message-history/spec.md)
- [Long-Term Memory delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/long-term-memory/spec.md)
- [Development dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

### 对照实现与现行契约

- [Agent Runtime source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src)
- [Backend source](file:///Users/elvis/file/develop/opensource/openharness/backend/src)
- [Current OpenSpec specs](file:///Users/elvis/file/develop/opensource/openharness/openspec/specs)
- [Responsibility boundary](file:///Users/elvis/file/develop/opensource/openharness/docs/architecture/responsibility_boundary.md)

## 主要发现

### Critical

1. **审批状态在重启后不可继续，却被定义为继续等待。** 当前 `ApprovalStore` 通过进程内 Promise waiter 唤醒 runner；execution continuation、step、catalog、model response 和 tool batch 均未持久化。仅恢复 `waiting_approval` 记录会产生没有 runner 的半恢复状态，并可能永久占用 active execution lock。契约必须二选一：重启后将 pending approval 失效并把 execution 终止为专用 interrupted 状态；或完整定义 checkpoint、runner 重建、approval 原子消费和重复工具调用幂等协议。

2. **SQLite 原子事务边界不完整。** 当前 delta 只覆盖“进入 waiting approval”示例，没有规范 execution 创建、稳定 user message、runtime event、approval decision、tool result、final message、terminal state 和 live publish 的完整 commit 边界。必须定义统一 Unit of Work/transaction API、post-commit notification/outbox 语义，并对每个提交前后注入 crash tests。

3. **SQLite cutover 后没有可验证的 rollback。** 当前设计承认产生 SQLite 新写入后仍需未来设计 export procedure，无法满足 strict migration gate。批准前必须定义版本 fencing、备份一致性点、兼容矩阵、restore/export 工具、不可逆迁移规则、RPO/RTO 和演练条件；如果策略是只允许 forward-fix，也必须明确写入契约并设置人工 cutover gate。

4. **MCP 与 provider adapter 规范归属缺失。** Proposal 要求真实 MCP 和双 Provider 验收，但 spec delta 未包含 `mcp-tools` 与 `provider-adapter`，dashboard 也未列出这两个 current spec。仅写在 design/tasks 中不会进入归档后的 current truth，真实集成验收将不可审计。

5. **24 小时 soak 没有确定的 pass/fail oracle。** 当前仅写“bounded resource growth”，未锁定 workload mix、机器/版本、采样周期、错误率、p95/p99、RSS/heap/FD、DB/WAL、MCP child 上限、趋势窗口、重启次数和失败即停规则；预算决策时点在 design/tasks 中也不一致。任何结果都可能被事后解释。

6. **真实 Provider/工具验收矩阵不可审计。** 未定义 endpoint/protocol version、模型能力前置条件、请求与响应证据、stream/reasoning 映射断言、usage/cost 容差、故障注入、secret canary 扫描范围、sandbox 类型和明确 skip/fail 规则。

7. **LLM Streaming 过程中的持久化折中与 Cursor 一致性缺失。** 当前 delta 未规范 LLM stream 过程中的数据库 commit 行为。若对每个 token 写入都提交事务，将导致 SQLite 锁争用与 I/O 瓶颈；若只在 stream 结束时 commit，则进程突然崩溃会导致客户端“已读”但数据库“未存”的幻象消息，引起 event replay 序列断层。必须在契约中定义 stream fragment 与最终 message 的提交时机和异常对齐规则。

### Important

1. **可信服务认证边界未定义。** 仅要求 identity header 不够；当前 Runtime 对缺失 identity 存在默认 tenant/user 路径。必须明确 production service credential（如 mTLS/JWT/轮换 service token）、header 与认证主体绑定、禁止 body/query 覆盖，并覆盖 authenticated IDOR、跨 tenant conversation/execution/approval/event/memory 枚举负例。

2. **“零重复副作用”与 Gateway 内存幂等实现冲突。** Java Gateway 当前幂等记录为进程内状态。若 soak 重启 Java，重复副作用无法排除；若只重启 TS，契约必须明确故障域并保持 Java 存活。若要求 Gateway 重启恢复，则需新增持久化幂等、reserve/complete、unknown outcome、TTL 和 payload canonicalization 契约。

3. **事件 cursor 和 retention 语义不完整。** 需要定义数据库唯一约束、sequence 分配事务、low/high watermark、prune 后 cursor gap、conversation 删除重建及 replay-to-live 的 post-commit 无缝切换。

4. **single-node 未明确 single-process/single-worker。** 当前 active execution lock 是 read-then-create，多个 worker 会竞态。需限制生产为单 worker，或使用数据库唯一约束/CAS/lease 原子获取 active lock，并明确 SQLite writer queue、busy timeout、checkpoint、磁盘满和只读行为。

5. **SQLite 独占写入锁与 Node.js 异步事件循环的并发竞态。** 尽管限制为 single-worker，但 Node.js 异步事件循环中并发执行的多个 database write 仍会发生 `SQLITE_BUSY`。必须明确 SQLite 驱动程序的 busy_timeout、写锁事务模式（如强制 `IMMEDIATE` 或 `EXCLUSIVE`），并设计带退避的 retry 机制。

6. **历史 JSON 导入的损坏隔离（Quarantine）与 Schema 校验机制缺失。** 当前设计要求 single-node v1 实现 cutover 一次性导入，但缺乏对历史 JSON 损坏、字段不兼容的隔离处理。一票否决式导入会导致 cutover 失败、RTO 严重超标。必须定义 Schema 强校验和损坏记录隔离归档机制。

7. **Event Cursor 缺乏 Tenant-scoped IDOR 防御机制。** 仅要求 private-service boundary 传入 identity header，但没有在 event replay API 的 cursor 检索中强制绑定租户隔离索引。由于 cursor 为 monotonic per-conversation，如果校验不严，可能被利用来进行 IDOR 越权枚举。

### Minor

1. **Approval token 安全策略未决定。** 需在批准前确定其是否为 secret、是否可恢复、TTL/单次消费、hash 或 encryption、key ownership、日志与 runtime event redaction、过期清理；不应把该决定完全推迟到实现阶段。

2. **测试与诊断日志中的真实凭据泄露风险。** 在 Stage 2/3 真实 provider 运行及故障注入测试中，会有大量 trace 产生。必须在架构上统一实现 Logger 拦截器，强制对 Authorization headers, `sk-...` 等 API keys 进行脱敏过滤（Redaction），防止其进入 stdout 或日志文件。

3. **SQLite WAL 模式下的磁盘空间膨胀与只读保护。** WAL 模式下高频读写若有未提交的读事务，会导致 WAL 文件无限膨胀。必须在 spec 中定义 WAL 自动 checkpoint 策略、最大 WAL 大小限制，以及系统磁盘空间不足时的主动只读保护（Write prevention）。

## 最终建议

以下初审建议均已纳入修订后的 proposal/design/spec deltas：

1. 单机生产 v1 明确为单 Runtime process/worker。
2. 重启时默认不恢复正在执行的 runner；`running` 与 `waiting_approval` 均进入专用 interrupted terminal，pending approval 失效。只有未来具备完整 continuation checkpoint 与幂等证明后才允许续跑。
3. 增加 Lifecycle Unit of Work，列出所有原子提交边界和 post-commit event 发布规则。
4. 将 `provider-adapter` 与 `mcp-tools` 纳入 delta 与 dashboard。
5. 在 proposal 审批前固化 real-provider/tool qualification matrix 和 soak report schema；性能阈值可先通过短基线测试产生，但产生方法、批准人和不得事后放宽的规则必须先写入契约。
6. 明确 restart fault domain：首版 soak 只重启 TS Runtime；Gateway 重启与持久化幂等单独立项，或纳入本 change 后补齐 backend durability contract。
7. 明确 SQLite cutover 后采用“可回退”还是“forward-fix only”，不得保留未决状态。
8. 规范 LLM Streaming 事务提交时机（例如：streaming fragment 仅写入内存/事件总线，最终 message 原子提交，并在重启 reconciliation 中将未完结的 stream 视为 interrupted 丢弃，由客户端重试）。
9. SQLite 统一使用 `IMMEDIATE` 事务模式，并在 driver 层配置合理的 `busy_timeout` 与退避重试，以解决多协程/多请求的并发写入锁竞争。
10. 设计 JSON 历史数据迁移的“容错隔离区”（Quarantine Queue），允许自动跳过并隔离损坏 JSON，确保主体 cutover 进度。
11. 建立统一的日志脱敏（Logging Redaction）模块，覆盖 Runtime 与 Backend Gateway 的全部 stdout / file trace。
12. 限制 SQLite WAL 空间大小并设置磁盘容量低水位保护（Low-disk prevention），防止 WAL 膨胀打满磁盘导致服务崩溃。

## 后续门禁

- OpenSpec proposal：**复审通过，等待用户明确批准**。
- Superpowers plan：**当前禁止生成**；仅在用户明确批准 proposal 后创建。
- 测试：修订后的 plan 必须包含 migration/crash matrix、认证与跨租户负例、real-provider/tool matrix、短基线和 24 小时 soak。
- 人工审批：SQLite cutover、真实凭证测试和 24 小时 soak promotion 均需人工 gate。
- 实施状态：未开始，当前仅有 proposal 制品与 review 文档。

## Review 记录

- Reviewer A：架构、SQLite、事务、恢复与迁移，结论 `BLOCK`。
- Reviewer B：OpenSpec、真实集成、安全与生产验收，结论 `BLOCK`。
- 最终第六轮复审：Reviewer A `PASS`；Reviewer B `PASS`；无 remaining findings。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：结构校验通过；结构合法不代表生产契约充分。
