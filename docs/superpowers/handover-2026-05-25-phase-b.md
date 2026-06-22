# Phase B 会话交接（add-p3a-multi-step-loop）

> 日期：2026-05-25
> 上下文：Phase B 已完成 3/7 段（Sections 1-3），其余 4-7 段交给下个会话继续。

---

## 一、项目背景速览

**OpenHarness** = Agent Harness 平台（"AI 时代的 AWS"基础层），三层架构：

```
Frontend (React/Vite)
    ↓
Agent Runtime (TS / Fastify)   ← Agent Harness Owner（loop / history / tools / hook）
    ↓
Backend (Java / Spring Boot)   ← Enterprise Gateway Owner（model gateway / policy / catalog / trace）
```

**关键约束**（来自 `docs/architecture/responsibility_boundary.md`）：
- Java 不得拥有第二套 Agent loop / 不得修改 messages / 不得吞 reasoning blocks
- TS 不得持有 provider key / 不得绕过 Java executeTool / 不得跳过 X-Trace-Id 透传
- Frontend 只调 TS Runtime
- 所有架构性变更走 OpenSpec change 流程

**仓库根**：`/Users/elvis/file/develop/opensource/openharness/`
**真 LLM 已通**：智谱 `glm-4-flash`（key 在 `.env` `SENSENOVA_API_KEY` 变量里，遗留命名）

---

## 二、历史里程碑（已 archive）

`openspec/changes/archive/2026-05-25-*`：

- implement-p0a-skeleton — 三层骨架
- implement-p0b-hookable — SSE + policy hook + ask_user
- add-p1a-provider-adapter — Anthropic + OpenAI-compat + cacheHints
- add-p1b-persistence — JsonFileHistoryStore + insert-then-compress
- add-p2a-mcp — MCP stdio 工具集成
- add-p2b-session-list — Frontend 多会话管理
- add-p2c-auto-compress — agentLoop 自动压缩

---

## 三、当前 Active OpenSpec Changes

| Change | 状态 | 备注 |
|--------|------|------|
| **add-p3a-multi-step-loop** | **正在实施 Phase B**（3/7 段已完成） | 已 approved，按 tasks.md 顺序推进 |
| add-p3c-policy-mcp-aware | 等独立审批 | Phase A 起好的小型 change，**不要在 Phase B 期间动它** |

---

## 四、Phase B 进度

| # | Section | 状态 | 说明 |
|---|---------|------|------|
| 1 | Types & Schema | ✅ | types.ts 加 StopReason / stepBudget? / stopReason?；trace.ts 加 11 个 event 常量；shared-schema 不含 AgentChatRequest 故 1.2 N/A |
| 2 | AgentLoop 重构 | ✅ | while 循环 + callModel/runToolBatch 抽方法 + autoCompress 合并到 1 处 + server.ts 转发 stepBudget |
| 3 | AgentStreamLoop 重构 | ✅ | 同样 while 循环；SSE 全事件名保留并加 stepIndex；新增 step_budget_exhausted + agent_end(stopReason) |
| 4 | **Tests** | **NEXT** | 见 §五 |
| 5 | Frontend（可选）回归 | 待 | 9 个 frontend tests 重跑确认 |
| 6 | Docs | 待 | trace_schema.md + CONTEXT.md 增补 |
| 7 | Verification（硬门槛） | 待 | 全库 test/typecheck/openspec validate + 真 LLM E2E |

**当前测试基线**：agent-runtime 60 / frontend 9 / shared-schema 8 / integration 3 — Phase B 重构后全部仍绿。

**Phase B 已修改文件清单**（不要重复修改）：
```
agent-runtime/src/types.ts            # +StopReason, +stepBudget, +stopReason
agent-runtime/src/trace.ts            # +TRACE_* constants
agent-runtime/src/agentLoop.ts        # 重写为 while 循环
agent-runtime/src/agentStreamLoop.ts  # 同样重写
agent-runtime/src/server.ts           # 转发 body.stepBudget
```

---

## 五、Section 4 实施细则（下一段起点）

### 4.1 新建 `agent-runtime/test/multiStepLoop.test.ts`

5 个 cases（参考 `agent-runtime/test/autoCompress.test.ts` 的 FakeJavaClient 模式）：

| Case | 验证 |
|------|------|
| A | 3 轮工具循环正常完成 → `stopReason="FINAL_ANSWER"`，`chat()` 至少调 3 次 |
| B | `stepBudget=2` + 持续返回 toolCalls → `stopReason="STEP_BUDGET_EXHAUSTED"`，`STEP_BUDGET_EXHAUSTED` 事件 attribute `stepBudget=2` |
| C | 第一轮 model 直接给答案（无 toolCalls）→ `stopReason="FINAL_ANSWER"` 且 `executeTool` 未调 |
| D | 3 轮循环后 autoCompress 仅触发 1 次（spy `compress` 函数） |
| E | trace 中 `STEP_START` × N + `STEP_END` × N，`stepIndex` 严格递增（注意：只有发生 tool batch 的 step 才发 STEP_END，单 step 给答案不发） |

**FakeJavaClient 模式**：用 `chatRequests.length` 计数；按调用次序返回不同 message（前 N-1 次返 toolCalls，第 N 次返无 toolCalls）。

### 4.2 更新 `agent-runtime/test/agentRuntime.test.ts`

旧断言"恰好 2 次 chat()"改为"≥1 次且最后一次响应无 toolCalls"。

### 4.3 更新 `agent-runtime/test/autoCompress.test.ts`

调用次数断言改成"恰好 1 次/会话"（之前测试可能是"至少 1 次"，重构后应当严格 1 次）。

### 4.4 — 4.6 验证命令

```bash
cd agent-runtime && npx vitest run        # 期望 ~65 tests 全绿
cd agent-runtime && npx tsc --noEmit
cd packages/shared-schema && npx vitest run
```

---

## 六、Section 5-7 简述

### 5. Frontend 回归（非阻塞）
- `cd frontend && npx tsc --noEmit && npx vitest run` → 9 tests 应仍绿
- App.test.tsx 不消费 stepIndex / stopReason，应该不会回归
- 如有回归只调测试断言，**不动 frontend src**

### 6. Docs

`docs/architecture/trace_schema.md`：
- 新增段："STEP events: STEP_START / STEP_END / STEP_BUDGET_EXHAUSTED"
- 标注所有 event 的 attributes 可含 `stepIndex: number`

`CONTEXT.md`（Agent Loop Concepts 段）：
- `Step` — 一次 model + tools 调用的单元
- `StepBudget` — 单次 run() 允许的 step 上限，默认 25
- `StopReason` — `FINAL_ANSWER` / `STEP_BUDGET_EXHAUSTED` / `EMPTY_MODEL_RESPONSE`

### 7. Verification（硬门槛）

```bash
# 7.1
pnpm test    # 整库
# 7.2
pnpm typecheck
# 7.3
cd /Users/elvis/file/develop/opensource/openharness
npx openspec validate add-p3a-multi-step-loop --strict --no-interactive

# 7.4 真 LLM E2E（依赖 .env 的 zhipu key）
cd backend && set -a && . ../.env && set +a && nohup mvn spring-boot:run -q > /tmp/oh-be.log 2>&1 &
cd ../agent-runtime && nohup npx tsx src/index.ts > /tmp/oh-ag.log 2>&1 &
sleep 15

# 触发一个能让 model 产生工具调用的对话（mock fixture 不行，要用真 model）
# 选项：先用 mock fixture "tool-time" 验证两步循环已经能走通；
# 真模型多轮调工具需要它有意愿调，可能要 catalog 先加几个真有用的工具，
# 这步如果阻塞就只跑 mock 验证 + 把限制写到 7.5

# 7.5
# tasks.md 把 7.5 项打勾，附上 stopReason + stepIndex 序列摘要
```

### 7.x archive

```bash
npx openspec archive add-p3a-multi-step-loop --yes
npx openspec validate --all --strict --no-interactive
```

---

## 七、Phase B 硬约束（来自 `docs/vision/refactor-playbook.md` B4）

- ❌ 不得改 `model: "default"` 字符串（model router 是下个 change `add-p3b-cost-and-router`）
- ❌ 不得改 `cacheHints.ts` 算法（仅改调用频率）
- ❌ 不得改 `beforeToolUse` 与 Java policy 契约（payload / form 不变）
- ❌ 不得动 frontend src（section 5 是非阻塞回归验证）
- ❌ 不得绕过 `openspec validate`（7.3 是硬门槛）
- ✅ **必须**保留所有现有 SSE 事件名（agent_start / model_call_start / model_call_end / tool_call / tool_result / final_answer）
- ✅ **必须**让 `pnpm test` + `pnpm typecheck` + `openspec validate ... --strict` 三个**同时**通过才能宣称完成

---

## 八、报告模板（每完成一段贴一次）

```text
✅ Phase B / Section {N} 完成
- 已修改文件: [...]
- pnpm test: 全绿（X tests / Y files）
- pnpm typecheck: 通过
- 偏离 design 的地方: {无 / [...] }
- 下一步: Section {N+1}
```

Section 7 完成后用 `refactor-playbook.md` 末尾的全 Phase 模板。

---

## 九、给下个会话的起手 prompt

把以下内容粘到新会话首条消息：

```
请打开 /Users/elvis/file/develop/opensource/openharness/docs/superpowers/handover-2026-05-25-phase-b.md
读完整内容作为本会话工作指令。

我在上一会话执行 Phase B 的 add-p3a-multi-step-loop 到 Section 3 完成。
请从 Section 4 开始按文档第五节顺序实施：4.1 → 4.2 → 4.3 → 4.4-4.6 →
Section 5 → 6 → 7 → archive。

每完成一段贴一次第八节报告模板。
add-p3c-policy-mcp-aware 仍在等独立审批，不要碰。
```

---

## 十、关键环境信息

| 项 | 值 |
|---|---|
| Working dir | `/Users/elvis/file/develop/opensource/openharness` |
| Node | pnpm workspace |
| Java | Maven, 端口 8080 |
| Agent runtime port | 3001 |
| `.env` provider key | 智谱 `glm-4-flash`（变量 `SENSENOVA_API_KEY`） |
| `application.yml` default-provider | `zhipu` |
| Mock fixture header | `X-Mock-Fixture: plain` / `tool-time` / `reasoning-tool-time` 等 |
