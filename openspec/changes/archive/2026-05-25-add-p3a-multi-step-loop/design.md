# Design: add-p3a-multi-step-loop

## Context

Two-step loop 是 P0a 起步时的简化设计。P0b/P1a/P1b/P2 全部在它之上叠加。继续叠 P3 之前必须先把形状改正确。

参考论述：`docs/vision/why-agent-projects-fail-to-land.md` 第二节（"为什么 Claude Code 行，你的 Agent 不行"）。
缺口分析：`docs/vision/openharness-gap-analysis-and-roadmap.md` 第三节优化点 1。

## Goals

- 模型可以在任意一轮调用工具，也可以在任意一轮直接给答案。
- 引入 `stepBudget` 防止失控循环（默认 25，可被请求或环境变量覆盖）。
- 每一轮 model+tools 都是一个"step"，trace 中可被 replay。
- 把两步实现里散乱的 3 处 autoCompress hook 合并为 1 处。

## Non-Goals

- 不引入 reflection / planner 子图（未来 change）。
- 不改 catalog freeze 与 policy hook 的契约（仍然 per-step 调用）。
- 不修改 cacheHints 计算函数本身（仅改调用频率）。

## Decisions

### Decision 1：循环结构

```ts
async run(input: AgentLoopInput): Promise<AgentChatResponse> {
  await emit(this.event(input, "AGENT_START", "agent start"));
  this.history.append(/* user message */);
  const catalog = await this.toolRegistry.getFrozenCatalog(/* ... */);

  const stepBudget = input.stepBudget ?? defaultStepBudget();
  let stepIndex = 0;
  let stopReason: StopReason = "STEP_BUDGET_EXHAUSTED";
  let answer = "";

  while (stepIndex < stepBudget) {
    stepIndex += 1;
    await emit(this.event(input, "STEP_START", "step start", { stepIndex }));

    const resp = await this.callModel(input, catalog, stepIndex);

    if (!resp.message) {
      stopReason = "EMPTY_MODEL_RESPONSE";
      break;
    }
    this.history.append(resp.message);

    const toolCalls = resp.message.toolCalls ?? [];
    if (toolCalls.length === 0) {
      stopReason = "FINAL_ANSWER";
      answer = String(resp.message.content ?? "");
      break;
    }

    await this.runToolBatch(input, catalog, toolCalls, stepIndex);
    await emit(this.event(input, "STEP_END", "step end", { stepIndex }));
  }

  if (stepIndex >= stepBudget && stopReason === "STEP_BUDGET_EXHAUSTED") {
    await emit(this.event(input, "STEP_BUDGET_EXHAUSTED", "step budget exhausted", { stepBudget }));
  }
  await emit(this.event(input, "FINAL_ANSWER", "final answer"));
  await emit(this.event(input, "AGENT_END", "agent end"));
  await this.autoCompress(input);
  await this.history.save(input.tenantId, input.conversationId);
  return this.response(input, answer, stopReason);
}
```

`callModel` / `runToolBatch` 是私有方法，封装现有调用 + cacheHints + policy hook 的逻辑，使主循环可读。

### Decision 2：StopReason 取值

```ts
type StopReason =
  | "FINAL_ANSWER"            // model 输出无 toolCalls，正常结束
  | "STEP_BUDGET_EXHAUSTED"   // 达到 stepBudget 仍在调工具
  | "EMPTY_MODEL_RESPONSE";   // model 返回空 message（异常但需返回）
```

未来 `add-p3c-injection-guard` 会扩展 `POLICY_HARD_DENY`，本 change 不做。

### Decision 3：stepBudget 来源优先级

```text
input.stepBudget                         (per-request 显式指定)
> process.env.AGENT_STEP_BUDGET          (部署级覆盖)
> 25                                     (内置默认)
```

`AgentChatRequest` 加可选字段；frontend 当前不传，行为完全向后兼容。

### Decision 4：autoCompress 触发点

- 旧实现：`agentLoop.ts` 中 3 处 `await this.autoCompress(input)` 调用（无 message / 无 toolCalls / final 后）。
- 新实现：仅在 `run()` 末尾循环退出后调用一次。
- 语义对齐：旧实现中"3 处调用"实际上每一次 run() 也只会命中其中 1 处（互斥分支），所以行为不变。
- `auto-compress` capability 的 spec **不变**，只是被调用的源代码位置变了。

### Decision 5：SSE 事件兼容

`AgentStreamLoop` 当前发的事件名（`agent_start` / `model_call_start` / `model_call_end` / `tool_call` / `tool_result` / `final_answer`）**全部保留**。新增字段：

- `model_call_start` / `model_call_end` 增加 `stepIndex: number`
- 新事件 `step_budget_exhausted: { stepBudget }`
- 新事件 `agent_end: { stopReason }`（之前 stream 没显式发）

frontend `api.ts` 的 SSE parser 是按事件名分发的，新字段不传不会破坏旧解析；新增事件被忽略也没问题。

### Decision 6：测试策略

主战场是 `multiStepLoop.test.ts`（agent-runtime/test 新增），用现有的 `MockJavaClient` 模式驱动 model：

- **Case A**：3 轮工具循环（model → tool A → model → tool B → model → 给答案）
- **Case B**：stepBudget=2，model 在 2 轮内一直调工具 → `STEP_BUDGET_EXHAUSTED`
- **Case C**：第一轮 model 直接给答案（保留原 P0a 行为）
- **Case D**：autoCompress 在多轮循环结束后**只触发一次**

旧 `agentRuntime.test.ts` 中"恰好 2 次 chat()"的断言要改为"≥1 次 chat() 且最后一次无 toolCalls"。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| Mock 下行为正确，真 provider 下行为偏离（reasoning blocks、stop_reason 字段） | Phase A 已在 dev 环境通了 Anthropic key；本 change 末尾要做一次"真模型 ≥3 轮工具循环"手动验证 |
| 多步导致单次请求成本爆炸 | 引入 stepBudget；`add-p3b-cost-and-router` 会进一步加 budget hook |
| 现有测试断言"chat 调用次数"会失败 | 在 tasks.md 明确列出 5 个文件需要更新断言 |
| autoCompress 合并位置导致"未压缩状态被持久化"的 race | `await autoCompress` 在 `await history.save` 之前，与现状一致 |

## Migration Plan

1. 不需要数据迁移（无新表、无 schema 升级）。
2. SSE 客户端零改动可继续工作。
3. `AGENT_STEP_BUDGET` 不设置时行为接近旧两步（实测多数 mock 路径会在 step 2 内结束）。
4. 如需回滚：revert 单一 commit 即可，自身无外部依赖变化。

## Open Questions

- 是否要在 `STEP_BUDGET_EXHAUSTED` 时给 model 一次"summarize what you learned so far"机会再返回？倾向于不做，留给后续 reflection change。
- 是否需要 per-step trace 的 token 计费？依赖 `add-p3b-cost-and-router`，本 change 仅占位 `stepIndex`。
