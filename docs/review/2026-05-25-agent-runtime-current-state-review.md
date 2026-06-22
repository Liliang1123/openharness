# Agent Runtime 当前状态 Review

> 日期：2026-05-25  
> 评审人：default agent  
> 上下文：在 `add-p3b-cost-and-router` proposal 创建后、实施前，按用户要求基于 `docs/review/2026-05-25-agent-runtime-stability-final-plan.md` 做的对齐 review。

## 结论

**有风险（需修改）**。

`add-p3b-cost-and-router` 本身不与 stability final plan 冲突（它属于 provider 治理域），但当前会话的工作流违反了若干 review 与 OpenSpec 门禁规则。在这些偏离修正之前，不应启动 p3b 实施，也不能跨过门禁直接动 SSE / execution lifecycle / approval recovery / HistoryStore 语义。

## Review 范围

- `docs/review/2026-05-25-agent-runtime-stability-final-plan.md`（权威最终方案）
- `docs/review/README.md`（review 落盘规则）
- `AGENTS.md`（项目 review 规则）
- `CONTEXT.md`
- `agent-runtime/src/`（`agentLoop.ts` / `agentStreamLoop.ts` / `server.ts` / `askUserStore.ts` 等）
- `openspec/changes/add-p3b-cost-and-router/`（未批准 proposal）
- `docs/superpowers/plans/agent-runtime-stability-plan-2026-05-25.md`（违规文档）

## 主要发现

### 严重

1. **违规文件落在 `docs/superpowers/plans/`**  
   `docs/superpowers/plans/agent-runtime-stability-plan-2026-05-25.md` 自身声明"待 OpenSpec review，未批准实施"，但被放在 `docs/superpowers/plans/`，违反 `docs/review/README.md` 与 `AGENTS.md` 的"未批准方案不得入 plans/"规则。

2. **当前 `agentStreamLoop.ts` 与 final plan 在 7 个外部可见维度上有差距**：
   - SSE 事件不带 `eventId` / `executionId`
   - 无 `RuntimeEventStore`（append/since/subscribe）
   - 无 session events SSE endpoint（`GET /api/v1/sessions/:id/events`）
   - 主 stream 断开会随 `reply.raw.end()` 终止 execution（无 detached runner）
   - `REQUIRE_APPROVAL` 直接写字符串 `PENDING_APPROVAL` 到 HistoryStore（应进入 `waiting_approval` 状态）
   - HistoryStore 被运行中草稿污染（`PENDING_APPROVAL` / `POLICY_DENY` 字符串）
   - 无 `ExecutionState` 与 active execution lock，并发请求行为未定义
   
   以上每一项都属于 final plan §"OpenSpec 门禁不得低估"清单，必须先开 OpenSpec change `add-execution-lifecycle-and-stream-recovery`。

### 中等

3. **`AskUserStore` 在 stream loop 中未集成**  
   `askUserStore.ts` 已存在并被 `server.ts` 暴露，但 `agentStreamLoop.ts` 中 `REQUIRE_APPROVAL` 只把字符串塞进 history，没有写入 askUserStore。审批刷新恢复路径不通。

4. **terminal error class 不完整**  
   当前只有 `STEP_BUDGET_EXHAUSTED` / `EMPTY_MODEL_RESPONSE`。final plan §Phase 4 要求的 `MODEL_ERROR` / `TOOL_ERROR` / `POLICY_DENY` / `APPROVAL_TIMEOUT` / `EVENT_REPLAY_GAP` / `EXECUTION_ABORTED` 缺失。

### 流程偏离

5. **p3a / p3c archive 时 tasks.md 未勾选**  
   `openspec/AGENTS.md` 要求"After all work is done, set every task to `- [x]`"，但 archived tasks 仍是 `- [ ]`。

6. **CONTEXT.md 未覆盖 final plan 引入的术语**  
   `ExecutionId` / `ExecutionState` / `RuntimeEventStore` / `SessionEvent` / `active execution` 缺失。OpenSpec 获批后必须立即补全。

### 与 add-p3b-cost-and-router 的关系

p3b 与 final plan **技术上不冲突**：
- p3b：Java provider router + cost calc + TS `AgentChatResponse.usage` 透传
- final plan：SSE 协议 / execution lifecycle / approval recovery / HistoryStore 分层

但 final plan §"后续门禁"明确指出"下一步不是直接写代码，而是创建 OpenSpec change `add-execution-lifecycle-and-stream-recovery`"。这是架构稳定性的前置门禁，p3b 应在其后排序，避免在不稳定 SSE 路径上做 usage 透传后续返工。

## 最终建议

### 立即修正

| # | 动作 | 文件 |
|---|------|------|
| A | 把违规 plan 移到 `docs/review/` | `docs/superpowers/plans/agent-runtime-stability-plan-2026-05-25.md` → `docs/review/2026-05-25-agent-runtime-stability-initial-plan.md` |
| B | 暂停 `add-p3b-cost-and-router` 实施 | proposal 保留，等稳定性门禁结束后再排期 |
| C | 创建 OpenSpec `add-execution-lifecycle-and-stream-recovery`（草案） | `openspec/changes/add-execution-lifecycle-and-stream-recovery/` |
| D | 修正 p3a / p3c archived tasks.md 全部 `- [x]` | `openspec/changes/archive/2026-05-25-add-p3a-multi-step-loop/tasks.md`, `2026-05-25-add-p3c-policy-mcp-aware/tasks.md` |

### 后续门禁（OpenSpec 批准后）

按 final plan 顺序：
- Phase 1：事件协议 + ID 体系
- Phase 2：Detached Runner
- Phase 3：执行锁 + 审批恢复
- Phase 4：稳定性收敛 + History 分层

每个 Phase 写 `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md`，且只在对应 OpenSpec change 获批后开始。

## 后续门禁

- 必须 OpenSpec：`add-execution-lifecycle-and-stream-recovery`（草案 → 用户批准 → Superpowers plan → 实施）
- 不需要新 OpenSpec：本 review 文档的落盘、违规文件搬运、archived tasks.md 的勾选修正（属于流程合规）
- p3b 排期：等稳定性 change Phase 1（或更后）完成后，由用户决定是否继续

## 改动清单（本次 review 操作）

实际改动在 review 完成后由用户确认，本文件先记录建议范围。
