# Agent Runtime SQLite Storage Worker Task 03 Review

## 结论

通过。Task 3 已提供真实 Worker Client：主线程持有 singleton lock，Worker bootstrap 完成后才 ready，命令经有界优先级队列逐条投递，close 按排空—关闭—join—释放锁顺序执行，协议破坏或线程异常退出后 fail closed 且不自动替换 Worker。

## Review 范围

- [runtimeStorageWorkerClient.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerClient.ts)
- [runtimeStorageWorker.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorker.ts)
- [runtimeStorageWorkerClient.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerClient.test.ts)
- [runtimeStorageWorkerCrashFixture.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/fixtures/runtimeStorageWorkerCrashFixture.ts)
- [singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/singletonLock.ts)
- Task 1–2 的协议、调度器和 Kernel 回归测试。

## 主要发现

- 严重度：无阻塞项。
- Client 在创建 Worker 前获取数据库 lock；bootstrap 使用已存在数据库的 dev/inode 作为 expected identity；bootstrap 回应前 readiness 不成立。
- 调度器与 Client 共同保证最多一个 Worker RPC in-flight，请求用 UUID correlation，畸形响应和 requestId mismatch 均触发一次性 unavailable。
- `close()` 在入口立即停止新准入，继续执行已经接受的命令，最后投递 P0 `storage.close`，等待 Worker 0 状态退出后才释放 singleton lock。
- unexpected exit、Worker error 或协议破坏会拒绝 current 与全部 queued promise 为 `RUNTIME_STORAGE_UNAVAILABLE`，终止线程并释放锁，不生成替代 Worker。
- Node 20 的 `--import tsx` 不会转换 `.ts` Worker 入口；实现改用 Worker 内 `tsx/esm/api.register()` 后动态导入入口，真实线程测试已覆盖该生产启动路径。

## 验证记录

- Client RED：缺少 `runtimeStorageWorkerClient` 模块，按预期失败。
- `pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerClient`：通过，5 个测试。
- `pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerProtocol runtimeStorageCommandScheduler runtimeStorageWorkerKernel runtimeStorageWorkerClient singletonLock`：通过，5 个测试文件、25 个测试。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `git diff --check`：通过。

## 最终建议

进入 Task 4，将生产-facing lifecycle/history/memory/execution/approval/event ports 改为 Awaitable，并在 Runner、Stream、Server 的每个调用点显式 await；先建立 commit acknowledgement 前禁止 publish/flush 的 RED 证据。

## 后续门禁

- OpenSpec：继续 active change `harden-agent-runtime-single-node-production`。
- Superpowers：继续串行 TDD；未完成 async call-site 审计前不得切换生产 context。
- 测试：Task 4 必须覆盖 commit-before-publish 和 admission-before-flush。
- 人工审批：无需新增审批；Git 提交、推送和发布仍未授权。
