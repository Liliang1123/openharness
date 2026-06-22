# add-subagent-dispatcher Step 05 Review

## 结论

通过：Step 05 满足 Antigravity Brief 的 abort/timeout hardening 验收标准。父执行已 abort 时不会启动子模型调用，子模型超时时会返回结构化 `SUBAGENT_TIMEOUT`。

## Review 范围

- [Step 05 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/05-brief.md)
- [Step 05 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/05-report.md)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [SubagentDispatcher 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)
- [Superpowers plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md)

## 主要发现

### P0 / 阻塞问题

未发现阻塞问题。

### P1 / 关键依据

1. **父 abort 启动前拦截有效**
   - `agent-runtime/src/subagent/dispatcher.ts:45-54` 在调用 Java model 前返回 `SUBAGENT_ABORTED`。
   - `agent-runtime/test/subagentDispatcher.test.ts:305-307` 断言没有 model call。

2. **子执行 timeout 结构化返回有效**
   - `agent-runtime/src/subagent/dispatcher.ts:56-92` 使用 timeout wrapper 并返回 `SUBAGENT_TIMEOUT`。
   - `agent-runtime/test/subagentDispatcher.test.ts:337-338` 覆盖 timeout error class。

3. **验证证据充分**
   - dispatcher focused suite、组合 focused suite、typecheck 均通过。

### P2 / 非阻塞风险

1. 当前 timeout 不取消底层 Promise，仅让 dispatcher 先返回超时结果。受限于当前 JavaClient 接口，暂可接受。
2. child allowed-tool 的 `beforeToolUse` 审计仍未实现，下一步必须补齐，否则 OpenSpec “每个剩余 child tool call 必须仍走 policy audit”尚未完全满足。

## 最终建议

- 允许进入 child allowed-tool policy audit and execution 步骤。
- 下一步应限定在 dispatcher 与 dispatcher tests，避免再次扩大 runner 接入范围。

## 后续门禁

- 下一步完成后需复跑 dispatcher、runner、toolRegistry focused tests 与 typecheck。
- 完成 policy audit 后，才能进入全量验证、tasks/dashboard 更新与 closeout。
