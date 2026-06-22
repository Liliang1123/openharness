# Antigravity CLI Brief: add-subagent-dispatcher Step 06

> [!IMPORTANT]
> 本文件是 Antigravity CLI 的唯一执行边界。
> 禁止扩大 scope。
> 禁止 `git add` / `git commit`。
> 禁止 `npx openspec archive`。
> 禁止批量格式化、import 排序或重排无关代码。
> 遇到 Brief 未覆盖的问题、测试失败原因不清、需要新增依赖、需要改 OpenSpec 或架构边界时，必须停止并写 abort report。

## 1. 项目路径

```text
/Users/elvis/file/develop/opensource/openharness
```

## 2. 当前 change

```text
add-subagent-dispatcher
```

## 3. 你的角色

你是 Antigravity CLI Implementer Agent。

本轮只执行 **child allowed-tool policy audit and execution**。不要更新 OpenSpec tasks/dashboard，不要改 runner，不要新增公开 API。

## 4. 必读文件

- `AGENTS.md`
- `openspec/AGENTS.md`
- `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md`
- `docs/agent-collab/add-subagent-dispatcher/05-review.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-step-05-review.md`
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/src/beforeToolUse.ts`
- `agent-runtime/src/javaClient.ts`

## 5. 本轮目标

补齐 OpenSpec 要求：child model 返回仍在 child catalog 内的 allowed tool call 时，必须先走 `beforeToolUse` 审计，再执行 Java tool；如果 policy DENY / REQUIRE_APPROVAL，则返回 `SUBAGENT_POLICY_DENY` 且不执行工具。

最小行为：

1. child first model call 返回 allowed tool call（如 `read_file`）时，dispatcher 调 `beforeToolUse()`；
2. policy `ALLOW` 时，dispatcher 调 `javaClient.executeTool()`；
3. dispatcher 将 child assistant tool call 与 tool result 作为 child messages 追加到第二次 `javaClient.chat()`，并返回第二次模型 summary；
4. `usage.costUsdMicros` 聚合 first + second Java model response 的 cost；
5. policy `DENY` 或 `REQUIRE_APPROVAL` 时，返回 `SUBAGENT_POLICY_DENY`，不得执行 Java tool；
6. 工具执行返回非 ok 时，返回 `SUBAGENT_TOOL_ERROR`。

## 6. 允许修改文件

本轮只允许创建 / 修改：

- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `docs/agent-collab/add-subagent-dispatcher/06-report.md`
- `docs/agent-collab/add-subagent-dispatcher/06-report-abort.md`（仅中断时）

## 7. 禁止修改文件

本轮禁止修改：

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/test/agentExecutionRunner.test.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`
- `agent-runtime/src/types.ts`
- `packages/shared-schema/**`
- `openspec/**`
- `docs/project-dashboard/**`
- `AGENTS.md`
- `README.md`
- 任意与 child policy audit 无关的文件

## 8. 必须执行的测试设计

在 `agent-runtime/test/subagentDispatcher.test.ts` 扩展 Fake client：

- 支持 `nextToolCallName = "read_file"` 返回 allowed tool call；
- 支持第二次 chat 返回 `"child summary after tool"`；
- 支持 `policyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL"`；
- 记录 `policyRequests` 与 `executedTools`。

新增至少 2 个测试：

### 8.1 allowed child tool call is audited, executed, and summarized

断言：

- `policyRequests.length === 1`；
- `policyRequests[0].conversationId` 是 child conversation id；
- `executedTools.length === 1`；
- `executedTools[0].conversationId` 是 child conversation id；
- result `status === "ok"`；
- result `summary` 包含第二次模型 summary；
- result `usage.costUsdMicros` 是两次 Java model response 的 cost 之和。

### 8.2 denied child tool call is not executed

断言：

- policy decision 为 `DENY` 时 result `status === "error"`；
- result `errorClass === "SUBAGENT_POLICY_DENY"`；
- `executedTools.length === 0`。

## 9. 实现要求

在 `agent-runtime/src/subagent/dispatcher.ts`：

1. 引入：

```ts
import { beforeToolUse } from "../beforeToolUse";
import type { AgentMessage, ToolCall, ToolCallRequest } from "../types";
```

2. 建议抽出 helper：

```ts
function costOf(response: { usage?: { costUsdMicros?: number } }): number {
  return typeof response.usage?.costUsdMicros === "number" ? response.usage.costUsdMicros : 0;
}
```

3. first response 如果 `childToolCalls.length === 0`，保持现有 summary 返回。

4. first response 如果有 child tool calls：

- 先做现有 allowed-set 检查；
- 再调用 `beforeToolUse(childToolCalls, context, this.javaClient, input.parent.headers)`；
- context 使用 child attribution：
  - `requestId: input.parent.requestId`
  - `conversationId: childConversationId`
  - `userId / tenantId / traceId` 继承 parent
  - `catalogVersion / catalogHash` 使用 `input.parentCatalog`
  - `toolPermissions` 从 child tools 派生 Map
- 如果任一 decision 不是 `ALLOW`，返回 `SUBAGENT_POLICY_DENY`。
- 对每个 allowed tool call parse `argumentsRaw`，构造 `ToolCallRequest`，调用 `javaClient.executeTool()`。
- 如果 tool result 非 ok，返回 `SUBAGENT_TOOL_ERROR`。
- 构造 second chat messages：原 system/user messages + first assistant message + child tool result messages。
- 第二次 chat 同样用 `withTimeout()`。
- 返回第二次 chat 的 summary 和聚合 cost。

5. 不要实现无限循环；本轮只支持一轮 child tool batch + second summary call。后续如果要多轮，再单独 OpenSpec/Brief。

## 10. 验证命令

本轮必须执行：

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
```

## 11. 完成后写 report

正常完成后，写入：

```text
docs/agent-collab/add-subagent-dispatcher/06-report.md
```

报告格式：

```markdown
# Agent Work Report: add-subagent-dispatcher Step 06

## 改动文件
- ...

## 实现摘要
- ...

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：passed / failed
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：passed / failed
- `pnpm --filter @openharness/agent-runtime typecheck`：passed / failed

## RED/GREEN 证据
- RED：...
- GREEN：...

## 已知风险
- ...

## 未完成
- ...

## 需要 Review Owner 判断的问题
- ...
```

## 12. 中断协议

如果遇到以下任一情况，停止执行并写：

```text
docs/agent-collab/add-subagent-dispatcher/06-report-abort.md
```

必须中断的情况：

- 需要修改“允许修改文件”以外的文件；
- 需要改 `beforeToolUse.ts`、JavaClient 类型、shared schema 或 runner；
- 需要支持多轮 child tool loop 才能通过测试；
- 测试失败但原因不清；
- 需要新增依赖；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足。

---

# Fix Brief: Step 06 Review 修复要求

> [!IMPORTANT]
> 本 Fix Brief 是当前 Step 06 的唯一修复范围。
> 只允许修复下列两个问题，不得扩大 scope。
> 禁止 `git add` / `git commit`。
> 禁止 `npx openspec archive`。

## 修复目标

Codex Review 结论为 `需修改`。必须修复：

1. policy 缺失 decision 时不得执行 child tool；
2. child tool `argumentsRaw` 解析后必须是 object，不能是 `null`、array 或 primitive。

## 允许修改文件

- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `docs/agent-collab/add-subagent-dispatcher/06-report.md`
- `docs/agent-collab/add-subagent-dispatcher/06-report-abort.md`（仅中断时）

## 禁止修改文件

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/test/agentExecutionRunner.test.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`
- `packages/shared-schema/**`
- `openspec/**`
- `docs/project-dashboard/**`
- `AGENTS.md`
- `README.md`

## 必须新增测试 1：missing policy decision denies child tool

扩展 `FakeSubagentJavaClient`，增加可返回空 decisions 的能力，例如：

```ts
policyDecision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "MISSING" = "ALLOW";
```

在 `evaluatePolicy()` 中：

```ts
if (this.policyDecision === "MISSING") {
  return { requestId: req.requestId, conversationId: req.conversationId, decisions: [] };
}
```

新增测试：

```ts
it("denies child tool call when policy decision is missing", async () => {
  const javaClient = new FakeSubagentJavaClient();
  javaClient.nextToolCallName = "read_file";
  javaClient.policyDecision = "MISSING";
  const dispatcher = new SubagentDispatcher(javaClient);

  const result = await dispatcher.run({
    parent: {
      executionId: "parent-exec-1",
      tenantId: "t1",
      conversationId: "parent-conv",
      requestId: "req-1",
      traceId: "trace-1",
      userId: "u1",
      headers: {},
      abortSignal: new AbortController().signal
    },
    toolCallId: "call-skill",
    skill: {
      metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
      content: "Summarize.",
      sourcePath: "/tmp/worker-skill/SKILL.md"
    },
    task: "summarize files",
    parentCatalog,
    timeoutMs: 30_000
  });

  expect(result.status).toBe("error");
  expect(result.errorClass).toBe("SUBAGENT_POLICY_DENY");
  expect(javaClient.executedTools).toHaveLength(0);
});
```

## 必须新增测试 2：non-object arguments are rejected

让 fake child model 返回 invalid object arguments，例如增加字段：

```ts
nextArgumentsRaw = "{}";
```

tool call 中使用 `argumentsRaw: this.nextArgumentsRaw`。

新增测试：

```ts
it("rejects child tool arguments that are not objects", async () => {
  const javaClient = new FakeSubagentJavaClient();
  javaClient.nextToolCallName = "read_file";
  javaClient.nextArgumentsRaw = "[]";
  const dispatcher = new SubagentDispatcher(javaClient);

  const result = await dispatcher.run({
    parent: {
      executionId: "parent-exec-1",
      tenantId: "t1",
      conversationId: "parent-conv",
      requestId: "req-1",
      traceId: "trace-1",
      userId: "u1",
      headers: {},
      abortSignal: new AbortController().signal
    },
    toolCallId: "call-skill",
    skill: {
      metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
      content: "Summarize.",
      sourcePath: "/tmp/worker-skill/SKILL.md"
    },
    task: "summarize files",
    parentCatalog,
    timeoutMs: 30_000
  });

  expect(result.status).toBe("error");
  expect(result.errorClass).toBe("SUBAGENT_TOOL_ERROR");
  expect(javaClient.executedTools).toHaveLength(0);
});
```

## 必须修复实现 1：decision map deny-by-default

把当前：

```ts
const decisions = await beforeToolUse(...);
for (const decision of decisions) {
  if (decision.decision !== "ALLOW") { ... }
}
```

改为按每个 child tool call 检查：

```ts
const decisions = await beforeToolUse(childToolCalls, auditContext, this.javaClient, input.parent.headers);
const decisionMap = new Map(decisions.map(decision => [decision.toolCallId, decision]));
for (const toolCall of childToolCalls) {
  const decision = decisionMap.get(toolCall.id);
  if (!decision || decision.decision !== "ALLOW") {
    return {
      status: "error",
      summary: "",
      childExecutionId,
      childConversationId,
      errorClass: "SUBAGENT_POLICY_DENY",
      errorMessage: `Subagent tool execution policy evaluation not ALLOWed: ${decision?.decision ?? "MISSING"}`,
      usage: { costUsdMicros: aggregatedCost }
    };
  }
}
```

## 必须修复实现 2：argumentsRaw object-only 校验

把 parse args 改为：

```ts
let parsedArgs: Record<string, unknown>;
try {
  const parsed = JSON.parse(toolCall.argumentsRaw);
  if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("not object");
  }
  parsedArgs = parsed as Record<string, unknown>;
} catch {
  return {
    status: "error",
    summary: "",
    childExecutionId,
    childConversationId,
    errorClass: "SUBAGENT_TOOL_ERROR",
    errorMessage: `Failed to parse tool arguments: ${toolCall.name}`,
    usage: { costUsdMicros: aggregatedCost }
  };
}
```

## 必须验证

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
```

## 完成后

更新：

```text
docs/agent-collab/add-subagent-dispatcher/06-report.md
```

报告需说明：

- 新增了哪些失败用例；
- 修复后 GREEN 结果；
- 是否仍有风险。
