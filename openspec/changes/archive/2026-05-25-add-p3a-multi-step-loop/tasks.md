## 1. Types & Schema

- [x] 1.1 `agent-runtime/src/types.ts`：新增 `StopReason` 联合类型；`AgentChatRequest` 加可选 `stepBudget?: number`；`AgentChatResponse` 加可选 `stopReason?: StopReason`
- [x] 1.2 `packages/shared-schema/src/`：如果 `AgentChatRequest`/`AgentChatResponse` 在此处有 zod schema，同步加上可选字段；写一个对应的 schema 测试
- [x] 1.3 `agent-runtime/src/trace.ts`：常量补充 `STEP_START` / `STEP_END` / `STEP_BUDGET_EXHAUSTED` 事件名；trace event 接受 `attributes.stepIndex`

## 2. AgentLoop 重构

- [x] 2.1 在 `agentLoop.ts` 抽出 `private async callModel(input, catalog, stepIndex)`，封装 `cacheHints` + `javaClient.chat`
- [x] 2.2 抽出 `private async runToolBatch(input, catalog, toolCalls, stepIndex)`，封装 `beforeToolUse` + 串行 `executeTool` + 回灌 history
- [x] 2.3 替换 `run()` 主体为 `while (stepIndex < stepBudget)` 循环，按 design Decision 1 实现
- [x] 2.4 删除原 3 处 `await this.autoCompress(input)`，合并到循环退出后一次调用
- [x] 2.5 在 `response()` 中传递 `stopReason`
- [x] 2.6 stepBudget 解析顺序：`input.stepBudget ?? Number(process.env.AGENT_STEP_BUDGET) ?? 25`

## 3. AgentStreamLoop 重构

- [x] 3.1 同 2.1/2.2 抽方法
- [x] 3.2 主体改为 `while` 循环
- [x] 3.3 SSE 事件 `model_call_start` / `model_call_end` 数据加 `stepIndex`
- [x] 3.4 新增 SSE 事件 `step_budget_exhausted` 和显式 `agent_end`（带 `stopReason`）
- [x] 3.5 `autoCompress` 与 `history.save` 在 `reply.raw.end()` 之前调用一次
- [x] 3.6 注意：`AgentStreamLoop` 构造器目前未注入 `mcpRegistry`，本 change 不修复（保持现状），仅在 design Open Questions 留记

## 4. Tests

- [x] 4.1 新建 `agent-runtime/test/multiStepLoop.test.ts`：
  - [x] 4.1.1 Case A：3 轮工具循环正常完成（断言 `chat()` 至少调 3 次、最终 `stopReason === "FINAL_ANSWER"`）
  - [x] 4.1.2 Case B：`stepBudget=2` + 持续返回 toolCalls → `stopReason === "STEP_BUDGET_EXHAUSTED"`
  - [x] 4.1.3 Case C：第一轮 model 直接给答案 → `stopReason === "FINAL_ANSWER"` 且工具未执行
  - [x] 4.1.4 Case D：3 轮循环后 `autoCompress` 仅被调用 1 次（spy）
  - [x] 4.1.5 Case E：trace 中包含 `STEP_START` × N 和 `STEP_END` × N，且 stepIndex 严格递增
- [x] 4.2 更新 `agent-runtime/test/agentRuntime.test.ts`：把"恰好 2 次 chat 调用"的硬断言改为"≥1 次且最后一次无 toolCalls"
- [x] 4.3 更新 `agent-runtime/test/autoCompress.test.ts`：调用次数断言改成"恰好 1 次/会话"
- [x] 4.4 `pnpm --filter @openharness/agent-runtime test` 全部绿
- [x] 4.5 `pnpm --filter @openharness/agent-runtime typecheck` 通过
- [x] 4.6 `pnpm --filter @openharness/shared-schema test` 全部绿

## 5. Frontend（可选，非阻塞）

- [x] 5.1 `frontend/src/api.ts` SSE parser 不破坏（新增字段忽略即可，写一个回归测试）
- [x] 5.2 `frontend/test/App.test.tsx` 跑通无回归

## 6. Docs

- [x] 6.1 `docs/architecture/trace_schema.md` 补 `STEP_START` / `STEP_END` / `STEP_BUDGET_EXHAUSTED` 与 `stepIndex` 字段
- [x] 6.2 `CONTEXT.md` "Agent Loop Concepts" 段加术语 `Step` / `StepBudget` / `StopReason`

## 7. Verification（本 change 完成的硬门槛）

- [x] 7.1 `pnpm test` 整库全绿
- [x] 7.2 `pnpm typecheck` 整库通过
- [x] 7.3 `openspec validate add-p3a-multi-step-loop --strict --no-interactive` 通过
- [x] 7.4 手动 E2E（依赖 Phase A 的真 LLM dev 接入）：用 Anthropic 跑一次"读文件 → 让 model 决定要不要再调 read_file → 再答"的两轮循环，确认 `stopReason === "FINAL_ANSWER"` 且 `stepIndex` 单调递增
- [x] 7.5 把循环退出场景的截图或日志摘要贴到本 change 完成评论中

---

## Completion Notes (2026-05-25)

### 7.4 / 7.5 真 LLM E2E 验证结果

**模型**: 智谱 `glm-4-flash`（via `SENSENOVA_API_KEY`）

**场景 1 — 正常两步循环（FINAL_ANSWER）**

请求: `"现在几点？请用工具查询当前时间。"`

```json
{
  "stopReason": "FINAL_ANSWER",
  "trace": {
    "events": [
      "AGENT_START",
      "STEP_START",       "MODEL_NODE_START", "MODEL_NODE_END",
      "TOOL_EXECUTE_REQUEST", "OBSERVE_TOOL_RESULT",
      "STEP_END",
      "STEP_START",       "MODEL_NODE_START", "MODEL_NODE_END",
      "FINAL_ANSWER", "AGENT_END"
    ]
  }
}
```

stepIndex 序列: 1（tool batch）→ 2（final answer）— 严格递增 ✅

**场景 2 — stepBudget=1 耗尽（STEP_BUDGET_EXHAUSTED）**

请求: 同上，`stepBudget: 1`

```json
{
  "stopReason": "STEP_BUDGET_EXHAUSTED",
  "trace": {
    "events": [
      "AGENT_START",
      "STEP_START", "MODEL_NODE_START", "MODEL_NODE_END",
      "TOOL_EXECUTE_REQUEST", "OBSERVE_TOOL_RESULT",
      "STEP_END", "STEP_BUDGET_EXHAUSTED",
      "FINAL_ANSWER", "AGENT_END"
    ]
  }
}
```

`STEP_BUDGET_EXHAUSTED` 事件正确发出，`stopReason` 正确 ✅
