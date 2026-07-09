# Stage 1 Tasks 1–3 Implementation Review

## 结论

通过：Task 1-3 的代码实现、Zod 契约改造、以及 SQLite 初始化与锁/磁盘防线均已通过严格的单元与集成测试验证，共 43 个 Shared Schema 测试、24 个 Frontend 测试以及 248 个 Runtime 测试全数 PASS（包含 Task 3 聚焦的 8 个存储与限制测试），未发现阻碍性缺陷，可以正式进入 Task 4。

## Review 范围

以下文件均使用以 `file:///` 开头的完整绝对路径：
- 实施计划：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- 验证证据：[stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- 共享 Schema：[packages/shared-schema/src/index.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- 前端核心对接：
  - [frontend/src/api.ts](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/api.ts)
  - [frontend/src/runtimeProgress.ts](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/runtimeProgress.ts)
  - [frontend/src/App.tsx](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/App.tsx)
- 运行时存储管理与锁设计：
  - [agent-runtime/src/storage/runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorage.ts)
  - [agent-runtime/src/storage/singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/singletonLock.ts)
  - [agent-runtime/src/storage/diskGuard.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/diskGuard.ts)

## 主要发现

### Critical
未发现阻塞性缺陷与设计偏离。

### Important

1. **类型安全性与前后端契约一致性**
   - 共享 Schema 引入了 `durability: "durable" | "transient"` 的显式区分标记，并将 `userId` 强制注入所有会话事件，提高了系统的多租户隔离规范。
   - `PreviewDeltaEventSchema` 限制为 `transient` 且排除了 `eventId`，只携带 `previewSeq` 单调正整数序列号，结构设计极其严格。
   - 前端通过 [api.ts](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/api.ts) 消费新版 Schema，通过 `appendSSEWireEvent` 自动过滤 `durable` 事件的重复项，成功满足在网络重连时事件的不重不漏与状态一致性。

2. **SQLite 极简式内嵌 Migration 设计**
   - `runtimeStorage.ts` 直接定义了 `INITIAL_SCHEMA` 与 `schema_migrations` 版本控制。
   - `migrateRuntimeDatabase` 控制逻辑简洁且支持幂等应用，规避了引入笨重三方迁移库的风险，有力地实践了“简单优于复杂”的原则。

3. **平台原生 Singleton 独占锁设计**
   - [singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/singletonLock.ts) 架构优良。在 macOS 上调用 Node 原生 open 的 O_EXLOCK 原子标识上锁，在 Linux 上则使用带 `fd 3` 继承的子进程 `flock` 进行防线控制。
   - 该文件描述符绑定锁由内核负责生命周期托管，能在 Runtime 进程意外消亡或崩溃时瞬间被 OS 级自动释放，有效防止死锁或虚假单例租赁脑裂问题。

4. **单元测试与集成测试极为扎实**
   - 针对 Task 3 专门编写的 8 个核心测试用例（`runtimeStorage` 4项、`diskGuard` 3项、`singletonLock` 1项）全部在本地通过。
   - `singletonLock.test.ts` 通过调用独立的 Node 子进程来进行非阻塞抢锁尝试，准确断言了 `already held` 的 23 错误退出码，用例质量非常优秀。

### Minor
- 暂无。代码格式严密，且 `git diff --check` 通过。

## 最终建议

同意第一阶段 Task 1–3 签字通过，建议开发人员/智能体可以正式切入 **Task 4 (Transaction-Bound Repositories)** 开发。

## 后续门禁

- **OpenSpec 门禁**：不需要新的 OpenSpec 提案。当前处于 Active 状态的 `harden-agent-runtime-single-node-production` 方案仍然有效并覆盖后续的全部开发。
- **Superpowers 计划**：继续沿用并严格贯彻 [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)。
- **测试门禁**：在 Task 4 实现后，必须在本地跑通如下单元测试：
  ```bash
  pnpm --filter @openharness/agent-runtime test -- sqliteHistory sqliteMemory sqliteExecution sqliteApproval sqliteRuntimeEvent
  ```
- **审批授权**：由用户人工确认本 Review 无异议后，可正式下发指令启动后续的 Task 4 智能体开发。
