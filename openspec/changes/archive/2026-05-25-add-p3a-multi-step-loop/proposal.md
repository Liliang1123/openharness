# Change: add-p3a-multi-step-loop

## Why

当前 `AgentLoop.run()` 与 `AgentStreamLoop.stream()` 都写死成"两步"形状：第一次 model 调用 → 一批工具 → 第二次 model 调用 → 结束。

这与 Claude Code 式"读文件 → 跑测试 → 看报错 → 改代码"的多轮工具循环根本不兼容：模型在第二次返回时如果还想调工具，当前实现会**丢弃**它，直接把 `final.message.content` 作为答案返回。

继续在两步形状之上叠加 P3 候选（mcp-http、policy-mcp-aware、trace-storage 等）会让重构成本非线性增长。当前 agent-runtime 仅 16 个 .ts / 60 个测试、零生产用户，是做这次架构性重构的最佳窗口。

## What Changes

- **`AgentLoop.run()` / `AgentStreamLoop.stream()`**：把 first → tools → final 的固定序列替换为 `while (stepBudget-- > 0)` 循环；每一轮都跑 `model → policy → tools → 回灌` 直到 model 不再产生 `toolCalls` 或 budget 耗尽。
- **`AgentChatResponse`**：新增 `stopReason` 字段（非破坏，可选），取值 `FINAL_ANSWER` / `STEP_BUDGET_EXHAUSTED` / `EMPTY_MODEL_RESPONSE`。
- **`AgentChatRequest`**：新增可选 `stepBudget?: number`（默认走环境变量 `AGENT_STEP_BUDGET`，再退到内置默认 25）。
- **TraceEvent**：新增 `STEP_START` / `STEP_END` / `STEP_BUDGET_EXHAUSTED` 三类事件，已有事件加上 `stepIndex` 属性。
- **SSE 事件**：`model_call_start` / `model_call_end` 加 `stepIndex`；新增 `step_budget_exhausted` 事件。
- **`autoCompress` hook 位置**：从两步代码中分散的 3 个调用点（`!first.message`、无 toolCalls、final 后）合并为**循环退出后的单一钩子点**。语义不变（仅触发位置统一）。
- **测试**：新增 `multiStepLoop.test.ts` 覆盖 ≥3 轮工具循环、step budget 耗尽、model 在中间轮直接给答案三类路径。

## Impact

- **Affected specs**: 新增 `agent-loop` capability。
- **Affected code**:
  - `agent-runtime/src/agentLoop.ts`（核心重构）
  - `agent-runtime/src/agentStreamLoop.ts`（核心重构 + SSE 字段）
  - `agent-runtime/src/types.ts`（`StopReason`、`AgentChatRequest.stepBudget`、`AgentChatResponse.stopReason`）
  - `agent-runtime/src/trace.ts`（新增事件类型 + `stepIndex` 属性）
  - `agent-runtime/test/agentRuntime.test.ts`（断言从"两次调用"改为"语义断言"）
  - `agent-runtime/test/autoCompress.test.ts`（hook 位置改一处）
  - `frontend/src/api.ts` / `App.tsx`（消费 SSE 新增的 `stepIndex`，可选改动）
  - `docs/architecture/trace_schema.md`（补 `stepIndex` / `STEP_*` 事件）
- **Breaking changes**: 无（`stopReason` 可选，旧客户端忽略即可；trace event 是叠加）。
- **Risk**: 中。多步 loop 与现有 autoCompress、cacheHints、beforeToolUse 三处协同点都要回归测试。

## Non-Goals

- 真实 LLM provider 替换（由 Phase A 的"最小化 dev 接入"准备 ground truth；本 change 仍可在 mock 下验证）。
- Cost meter / budget hook（下一个 change：`add-p3b-cost-and-router`）。
- Untrusted content tagging（下一个 change：`add-p3c-injection-guard`）。
- ContextBuilder 重构（P1 路线，见 `docs/vision/openharness-gap-analysis-and-roadmap.md`）。
- Model router（与 cost meter 一起做）。
