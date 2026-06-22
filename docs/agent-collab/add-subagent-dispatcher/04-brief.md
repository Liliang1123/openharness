# Antigravity CLI Brief: add-subagent-dispatcher Step 04

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

本轮只执行 **AgentExecutionRunner forked skill wiring**，对应 Superpowers plan 的 Task 3。不要执行 abort/timeout hardening，不要更新 OpenSpec tasks/dashboard。

## 4. 必读文件

- `AGENTS.md`
- `openspec/AGENTS.md`
- `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md`
- `docs/agent-collab/add-subagent-dispatcher/03-review.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-step-03-review.md`
- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/test/agentExecutionRunner.test.ts`

## 5. 本轮目标

把 `SubagentDispatcher` 接入 `AgentExecutionRunner.executeTool()` 的 `invoke_skill` 分支：

1. 当 `skill.metadata.fork_agent === true` 时，调用 `SubagentDispatcher.run()`；
2. forked skill 不得进入 `pendingInjections`；
3. 父 history 只追加 `invoke_skill` 的 summary tool result；
4. 父 history 不得包含 child-only skill instructions；
5. `subagent_model` 通过 dispatcher 转发到 child model request；
6. 非 fork skill 的既有 pending injection 行为不得回退。

## 6. 允许修改文件

本轮只允许创建 / 修改：

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/test/agentExecutionRunner.test.ts`
- `docs/agent-collab/add-subagent-dispatcher/04-report.md`
- `docs/agent-collab/add-subagent-dispatcher/04-report-abort.md`（仅中断时）

## 7. 禁止修改文件

本轮禁止修改：

- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`
- `agent-runtime/src/types.ts`
- `packages/shared-schema/**`
- `openspec/**`
- `docs/project-dashboard/**`
- `AGENTS.md`
- `README.md`
- 任意与本轮 Task 3 无关的文件

## 8. 必须执行的步骤

### 8.1 先写 failing integration regression

在 `agent-runtime/test/agentExecutionRunner.test.ts` 现有 `invoke_skill` 测试附近新增测试：

```ts
  it("routes fork_agent skills through subagent summary without parent pending injection", async () => {
    const skillDir = path.join(process.cwd(), "skills", "fork-worker");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
      "---",
      "name: fork-worker",
      "description: A forked worker skill",
      "version: 1.0.0",
      "tools_required: []",
      "parameters: {}",
      "fork_agent: true",
      "subagent_model: cheap-worker",
      "forbidden_tools: [run_command]",
      "---",
      "Child-only instructions must not be injected into parent history."
    ].join("\n"), "utf-8");

    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest) => {
      javaClient.chatRequests.push(request);
      if (request.conversationId.includes("::subagent-")) {
        return {
          requestId: request.requestId,
          conversationId: request.conversationId,
          rawProvider: "mock",
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            costUsdMicros: 11
          },
          message: { role: "assistant", content: "subagent summary" } as AgentMessage
        };
      }
      const parentCalls = javaClient.chatRequests.filter(r => !r.conversationId.includes("::subagent-")).length;
      if (parentCalls === 1) {
        return {
          requestId: request.requestId,
          conversationId: request.conversationId,
          rawProvider: "mock",
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "call-fork-skill", name: "invoke_skill", argumentsRaw: '{"skill_name":"fork-worker","task":"do child work"}' }]
          } as AgentMessage
        };
      }
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };

    const origSkills = process.env.OPENHARNESS_SKILLS_ENABLED;
    process.env.OPENHARNESS_SKILLS_ENABLED = "true";
    try {
      const runner = new AgentExecutionRunner(javaClient, history, undefined, runtimeEventStore, executionStateStore);
      const { done } = runner.start({
        ...baseInput,
        agentDefinition: { ...DEFAULT_AGENT_DEFINITION, tools: ["invoke_skill"], model: "default" }
      });
      await done;

      const parentMessages = history.get("t1", "conv-runner");
      expect(parentMessages.some(m => m.role === "tool" && m.toolName === "invoke_skill" && String(m.content).includes("subagent summary"))).toBe(true);
      expect(parentMessages.some(m => String(m.content).includes("Child-only instructions must not be injected"))).toBe(false);
      expect(javaClient.chatRequests.some(r => r.conversationId.includes("::subagent-") && r.model === "cheap-worker")).toBe(true);
    } finally {
      process.env.OPENHARNESS_SKILLS_ENABLED = origSkills;
      if (fs.existsSync(path.join(skillDir, "SKILL.md"))) fs.unlinkSync(path.join(skillDir, "SKILL.md"));
      if (fs.existsSync(skillDir)) fs.rmdirSync(skillDir);
    }
  });
```

### 8.2 运行 focused test 确认 RED

```bash
pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner
```

期望：新增测试失败，因为 fork skill 当前仍走 pending injection，未生成 child request / summary。

### 8.3 修改 `AgentExecutionRunner`

在 `agent-runtime/src/agentExecutionRunner.ts`：

1. 添加 import：

```ts
import { SubagentDispatcher } from "./subagent/dispatcher";
```

2. 添加 class field：

```ts
  private readonly subagentDispatcher: SubagentDispatcher;
```

3. constructor 中初始化：

```ts
    this.subagentDispatcher = new SubagentDispatcher(javaClient);
```

4. 在 `executeTool()` 的 `invoke_skill` 分支中，`parseSkillMarkdown(skillPath)` 后、写入 `pendingInjections` 前添加 fork 分支：

```ts
        if (skill.metadata.fork_agent === true) {
          const executionId = this.currentExecutionId(input.tenantId, input.conversationId);
          const parentState = this.executionStateStore.get(executionId);
          const subagentResult = await this.subagentDispatcher.run({
            parent: {
              executionId,
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              requestId: input.requestId,
              traceId: input.traceId,
              userId: input.userId,
              headers: input.headers,
              abortSignal: parentState?.abortController.signal ?? new AbortController().signal
            },
            toolCallId: toolCall.id,
            skill,
            task,
            parentCatalog: {
              catalogVersion: catalog.catalogVersion,
              catalogHash: catalog.catalogHash,
              tools: this.toolRegistry.getCatalogTools(input.tenantId, input.conversationId)
            },
            timeoutMs: resolveTimeoutMs("SUBAGENT_TIMEOUT_MS", 300_000)
          });

          if (subagentResult.status === "error") {
            await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", {
              toolName: toolCall.name,
              status: "error",
              stepIndex,
              childExecutionId: subagentResult.childExecutionId,
              errorClass: subagentResult.errorClass
            }));
            throw new RuntimeTerminalFailure("TOOL_ERROR", subagentResult.errorMessage ?? "Subagent failed", {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              stepIndex,
              childExecutionId: subagentResult.childExecutionId,
              errorClass: subagentResult.errorClass
            });
          }

          await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", {
            toolName: toolCall.name,
            status: "ok",
            stepIndex,
            childExecutionId: subagentResult.childExecutionId,
            childConversationId: subagentResult.childConversationId,
            subagentCostUsdMicros: subagentResult.usage?.costUsdMicros
          }));
          return toolMessage(toolCall.id, toolCall.name, subagentResult.summary, "trusted");
        }
```

5. 确保非 fork 分支的原 pending injection 逻辑保持原样。

## 9. 验证命令

本轮必须执行：

```bash
pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
```

## 10. 完成后写 report

正常完成后，写入：

```text
docs/agent-collab/add-subagent-dispatcher/04-report.md
```

报告格式：

```markdown
# Agent Work Report: add-subagent-dispatcher Step 04

## 改动文件
- ...

## 实现摘要
- ...

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner`：passed / failed
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

## 11. 中断协议

如果遇到以下任一情况，停止执行并写：

```text
docs/agent-collab/add-subagent-dispatcher/04-report-abort.md
```

必须中断的情况：

- 需要修改“允许修改文件”以外的文件；
- 非 fork `invoke_skill` 现有测试出现回归且原因不清；
- 需要修改 dispatcher / ToolRegistry / shared schema；
- 需要修改 OpenSpec；
- 需要新增依赖；
- 发现安全、权限、沙箱风险；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足。
