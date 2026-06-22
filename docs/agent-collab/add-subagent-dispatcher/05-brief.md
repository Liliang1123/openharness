# Antigravity CLI Brief: add-subagent-dispatcher Step 05

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

本轮只执行 **SubagentDispatcher abort/timeout hardening**。不要实现 child allowed-tool execution，不要接入新的 policy audit，不要更新 OpenSpec tasks/dashboard。

## 4. 必读文件

- `AGENTS.md`
- `openspec/AGENTS.md`
- `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md`
- `docs/agent-collab/add-subagent-dispatcher/04-review.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-step-04-review.md`
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`

## 5. 本轮目标

让 `SubagentDispatcher` 真正执行父 abort 与 subagent timeout 防护：

1. 如果父 `AbortSignal` 在启动前已 aborted，dispatcher 直接返回 `SUBAGENT_ABORTED`，不得调用 Java model；
2. 如果 child model call 超过 `timeoutMs`，dispatcher 返回 `SUBAGENT_TIMEOUT`；
3. 已有 Step 01-04 行为不回退：tool downgrade、default model、cost passthrough、forbidden child tool-call reject 均继续通过。

## 6. 允许修改文件

本轮只允许创建 / 修改：

- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `docs/agent-collab/add-subagent-dispatcher/05-report.md`
- `docs/agent-collab/add-subagent-dispatcher/05-report-abort.md`（仅中断时）

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
- 任意与本轮 abort/timeout hardening 无关的文件

## 8. 必须执行的步骤

### 8.1 写 abort-before-start 测试

在 `agent-runtime/test/subagentDispatcher.test.ts` 追加测试：

```ts
  it("returns SUBAGENT_ABORTED without model call when parent signal is already aborted", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);
    const ac = new AbortController();
    ac.abort();

    const result = await dispatcher.run({
      parent: {
        executionId: "parent-exec-1",
        tenantId: "t1",
        conversationId: "parent-conv",
        requestId: "req-1",
        traceId: "trace-1",
        userId: "u1",
        headers: {},
        abortSignal: ac.signal
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
    expect(result.errorClass).toBe("SUBAGENT_ABORTED");
    expect(javaClient.chatRequests).toHaveLength(0);
  });
```

### 8.2 写 timeout 测试

给 `FakeSubagentJavaClient` 增加：

```ts
  modelDelayMs = 0;
```

在 `chat()` 开头加入：

```ts
    if (this.modelDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.modelDelayMs));
```

追加测试：

```ts
  it("returns SUBAGENT_TIMEOUT when child model exceeds timeout", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.modelDelayMs = 50;
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
      timeoutMs: 1
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_TIMEOUT");
  });
```

### 8.3 确认 RED

运行：

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```

期望新增测试先失败。

### 8.4 实现 abort/timeout

在 `agent-runtime/src/subagent/dispatcher.ts`：

1. 在 `run()` 创建 child ids 后、调用 Java model 前检查：

```ts
    if (input.parent.abortSignal.aborted) {
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_ABORTED",
        errorMessage: "Subagent aborted before start"
      };
    }
```

2. 增加本地 timeout helper，避免抛异常破坏 dispatcher result 契约：

```ts
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | "__timeout__"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"__timeout__">(resolve => {
        timer = setTimeout(() => resolve("__timeout__"), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

3. 包裹 `this.javaClient.chat(...)`：

```ts
    const maybeResponse = await withTimeout(this.javaClient.chat({ ... }, input.parent.headers), input.timeoutMs);
    if (maybeResponse === "__timeout__") {
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_TIMEOUT",
        errorMessage: `Subagent timed out after ${input.timeoutMs}ms`
      };
    }
    const response = maybeResponse;
```

## 9. 验证命令

本轮必须执行：

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
```

## 10. 完成后写 report

正常完成后，写入：

```text
docs/agent-collab/add-subagent-dispatcher/05-report.md
```

报告格式：

```markdown
# Agent Work Report: add-subagent-dispatcher Step 05

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

## 11. 中断协议

如果遇到以下任一情况，停止执行并写：

```text
docs/agent-collab/add-subagent-dispatcher/05-report-abort.md
```

必须中断的情况：

- 需要修改“允许修改文件”以外的文件；
- 需要接入 child allowed-tool execution 或 policy audit；
- 需要修改 OpenSpec / shared schema / runner；
- 测试失败但原因不清；
- 需要新增依赖；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足。
