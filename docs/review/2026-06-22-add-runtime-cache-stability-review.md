# add-runtime-cache-stability Review

## 结论

需修改：OpenSpec 校验与 TS Runtime 单测在非沙箱环境通过，但实现未覆盖当前服务实际入口 `AgentExecutionRunner` 的 `[session context]` 注入，且 `transient` 消息会被 `JsonFileHistoryStore` 持久化，存在运行时语义和缓存稳定性偏差；同时项目要求的 Superpowers plan 与 dashboard verified 同步证据缺失。

## Review 范围

- `agent-runtime/src/cacheHints.ts`
- `agent-runtime/src/prompts/registry.ts`
- `agent-runtime/src/contextBuilder.ts`
- `agent-runtime/src/agentLoop.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/src/agentExecutionRunner.ts`（实际服务入口核对）
- `agent-runtime/src/jsonFileHistoryStore.ts`（transient 持久化核对）
- `agent-runtime/test/cacheHints.test.ts`
- `agent-runtime/test/contextBuilder.test.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`
- `agent-runtime/test/promptRegistry.test.ts`
- `openspec/changes/add-runtime-cache-stability/**`
- `docs/project-dashboard/**` 与 `docs/superpowers/plans/**` 的制品同步状态

## 主要发现

### 🔴 bug: 实际运行入口未注入 `[session context]`

- 位置：`agent-runtime/src/agentExecutionRunner.ts:158`, `agent-runtime/src/agentExecutionRunner.ts:351-354`
- 问题：当前 `server.ts` 使用 `AgentExecutionRunner`，不是 `AgentLoop`；但 `[session context]` 注入只实现于 `agentLoop.ts:77-92`。实际 HTTP/SSE 路径只追加真实用户消息，然后直接 `buildModelContext()` 和 `promptedMessages()`，不会产生动态 session context。
- 影响：OpenSpec `context-builder` delta 中“startup 注入 OS/date/model/directory”的验收条件在主路径不成立；用户汇报中的“动态注入时序”只覆盖 legacy/non-primary path。
- 建议：把 session context 注入逻辑提取为共享 helper，并在 `AgentExecutionRunner.runLoop()` 追加真实用户消息前调用；新增针对 `AgentExecutionRunner` 的测试，断言 `ModelChatRequest.messages` 顺序为 `system` → synthetic session context → real user。

### 🔴 bug: `transient` session context 会被 JSON 历史持久化

- 位置：`agent-runtime/src/agentLoop.ts:86-91`, `agent-runtime/src/jsonFileHistoryStore.ts:55-69`, `agent-runtime/src/history.ts:44-46`
- 问题：`agentLoop.ts` 将 session context 以 `transient: true` 写入 `HistoryStore`，但 `JsonFileHistoryStore.save()` 直接写出 `messages`，没有使用 `toReplay()` 过滤 transient。重新加载后 `stableHistory()` 也不会移除 transient。
- 影响：跨天或进程重启后旧 `[Session context: Today is ...]` 可能残留，多条 session context 会被 `contextBuilder.ts:27-35` 提升为 `session_context` 层，污染上下文并破坏“动态但不持久”的设计目标。
- 建议：明确 transient 的持久化契约：若不应落盘，`JsonFileHistoryStore.save()`/`loadSync()` 应使用 `toReplay()` 或等价过滤；同时补充跨保存/加载测试。

### 🟡 risk: Session 级 Tools Schema 冻结无生命周期释放

- 位置：`agent-runtime/src/toolRegistry.ts:14`, `agent-runtime/src/toolRegistry.ts:97-100`
- 问题：生产路径使用 static `ToolRegistry.entries`，按 `(tenantId, conversationId)` 永久缓存；当前仅提供手动 `clearSessionCatalog()`，未接入会话删除、TTL、LRU 或执行完成清理。
- 影响：长运行服务中 conversation 数增长会造成内存常驻；删除会话后 catalog 仍可能残留。
- 建议：接入 `HistoryStore.delete()`/会话生命周期清理，或加入 TTL/LRU，并补充测试。

### 🟡 risk: OpenSpec / 项目门禁制品未完全闭环

- 位置：`openspec/changes/add-runtime-cache-stability/tasks.md:17`, `docs/superpowers/plans/`, `docs/project-dashboard/development-log.json`
- 问题：`tasks.md` 标记已完成，但本仓库规则要求 OpenSpec 实施应有 `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md`；当前未发现 `add-runtime-cache-stability` 对应 plan。项目存在 `docs/project-dashboard/`，实现验证后也应同步 `development-log.json` 并重新渲染 dashboard，当前未发现该 change 记录。
- 影响：过程证据不完整，后续归档/审计时难以追踪计划、源文件、测试、状态。
- 建议：补齐 Superpowers plan 或明确豁免原因；同步 `development-log.json` 为 `verified`，运行 `node docs/project-dashboard/scripts/render-dashboard.mjs` 与 `pnpm dashboard:check`。

### 🟡 risk: Provider Message Capabilities 门禁未见实现与测试

- 位置：`openspec/changes/add-runtime-cache-stability/proposal.md:8`, `openspec/changes/add-runtime-cache-stability/tasks.md:16`
- 问题：proposal 明确包含“Provider Message Capabilities 门禁”，tasks 标记“Contract 测试覆盖 alternating roles 配对限制”，但本次核心实现与测试中未看到 provider capability adapter 或 alternating roles contract 测试。
- 影响：供应商消息限制相关风险未被代码或测试覆盖，任务勾选可能早于真实完成。
- 建议：要么实现并测试 provider capability gate；要么收窄 proposal/tasks，将该能力移至后续 OpenSpec change。

## 验证记录

1. 沙箱内运行：

```bash
pnpm --filter @openharness/agent-runtime test
```

结果：失败，`abortApi.test.ts` 与 `detachedStream.test.ts` 共 4 个用例因 `listen EPERM: operation not permitted 127.0.0.1` 失败，属于沙箱端口监听限制。

2. 非沙箱授权后重跑：

```bash
pnpm --filter @openharness/agent-runtime test && npx openspec validate add-runtime-cache-stability --strict --no-interactive
```

结果：通过。

```text
Test Files  36 passed (36)
Tests       195 passed (195)
Change 'add-runtime-cache-stability' is valid
```

## 最终建议

- 先修复两个阻塞问题：主路径 `AgentExecutionRunner` 注入缺失、`transient` 持久化泄漏。
- 再补齐或收窄 provider capability gate 相关 proposal/tasks。
- 最后补齐项目过程制品：Superpowers plan、development dashboard verified 同步与渲染检查。

## 后续门禁

- 继续实施当前 change 不需要新 OpenSpec，但需要修正当前 OpenSpec change 的实现与任务清单真实性。
- 修复后必须重跑：
  - `pnpm --filter @openharness/agent-runtime test`
  - `npx openspec validate add-runtime-cache-stability --strict --no-interactive`
  - 若同步 dashboard：`node docs/project-dashboard/scripts/render-dashboard.mjs`、`pnpm dashboard:check`
