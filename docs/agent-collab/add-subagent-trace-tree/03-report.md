# add-subagent-trace-tree Step 03 执行报告

## 1. 修改文件列表
本项目本次开发严格限制了修改文件范围，共修改了以下 4 个文件：
- [dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts) - 扩展了子智能体运行入参，加入了 trace events 的定义和生命周期各个节点 (start, model_call, tool_call, summary, end) 的事件发出。
- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts) - 在 fork skill 启动子智能体时传入 `stepIndex` 和 `emitTrace` 回调，并通过 best-effort 方式调用 Java `/api/v1/trace/events` 发送链路，失败时静默且安全地输出日志警告。
- [subagentDispatcher.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts) - 增加了测试用例，覆盖成功、超时、策略拒绝等状态 of TraceEvent 结构和属性，并验证序列化结果中排除了敏感的 instruction/content/prompt。
- [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/agentExecutionRunner.test.ts) - 扩展了 `FakeJavaClient` 支持链路收集和抛错模拟，并增加测试验证子执行调用 `postTrace` 以及当 `postTrace` 抛错时 Runner 的健壮性与抗干扰能力。

## 2. 验证命令与结果
### 单元测试验证
运行指令：
```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner
```
运行结果：
- 所有 35 个测试用例全部一次性成功通过 (`35 passed`)。
- 在 `resilient to postTrace failure and runs to completion` 测试中，按预期捕获并输出了警告信息：`[AgentExecutionRunner] postTrace failed for subagent event: Simulated postTrace failure`。

### TypeScript 编译检查
运行指令：
```bash
pnpm --filter @openharness/agent-runtime typecheck
```
运行结果：
- 编译检查无报错正常通过。

### 代码格式与质量检查
运行指令：
```bash
git diff --check -- agent-runtime/src/subagent/dispatcher.ts agent-runtime/src/agentExecutionRunner.ts agent-runtime/test/subagentDispatcher.test.ts agent-runtime/test/agentExecutionRunner.test.ts
```
运行结果：
- 彻底清理了所有修改行及测试用例中的多余 trailing whitespaces，检查无任何报错通过。

## 3. 是否偏离 Brief
- **无任何偏离**。
- 严格遵循只修改所列 4 个文件的原则，未修改 `packages/shared-schema/**`、`agent-runtime/src/traceTree.ts`、`agent-runtime/src/trace.ts` 以及任何 Java 端、前端、工程面板。
- 绝未擅自执行任何 `git add` / `git commit` / `git reset` / `git clean` 操作，充分体现了“毫无特权”和严守约束法则。

## 4. 剩余风险
- **Java 端上报延迟或超时的长尾风险**：若网络环境极差且 Java 服务端响应迟缓，由于采用了 `postTrace` 静默捕获方案，抛错会被吞掉从而保证 Agent 执行不受阻塞，但若调用为同步阻塞式或未被超时限制，可能仍会带来非常轻微的毫秒级时延风险。目前此方法为 `async` 异步调用，且在子执行和主执行中非阻塞进行，基本可忽略。

## 5. Review 修复记录
针对 `docs/review/2026-06-23-add-subagent-trace-tree-step-03-review.md` 提出的阻塞问题，在本地完成了如下修复和验证：

### 修复内容
1. **模型调用异常捕获 (SUBAGENT_MODEL_ERROR)**：
   - 针对 [dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts) 中的两处 `JavaClient.chat(...)`（即第一次 model call 和第二次 model call），使用 `try-catch` 块捕获可能由底层 JavaClient 抛出的 Promise reject 异常。
   - 捕获异常后，先通过 `emitSubagentTrace` 发送 `TRACE_SUBAGENT_END` 终端 trace 事件（带上 `status: "error"`, `terminalClass: "SUBAGENT_MODEL_ERROR"` 和当前的 `aggregatedCost`）。
   - 之后，不再向外抛错，而是返回结构化的 `SubagentRunResult` 结果（`status: "error"`, `errorClass: "SUBAGENT_MODEL_ERROR"`，并保留 `errorMessage` 和已累积的 `usage`）。
2. **工具执行异常捕获 (SUBAGENT_TOOL_ERROR)**：
   - 针对 [dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts) 中循环调用的 `JavaClient.executeTool(...)`，同样采用 `try-catch` 块捕获可能由于网络、通道问题抛出的 Promise reject 异常。
   - 捕获异常后，先发送终端 trace 事件（`status: "error"`, `terminalClass: "SUBAGENT_TOOL_ERROR"`, 并携带 `costUsdMicros: aggregatedCost`）。
   - 之后返回结构化的错误响应结果（`status: "error"`, `errorClass: "SUBAGENT_TOOL_ERROR"`）。
3. **单元测试补充**：
   - 在 [subagentDispatcher.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts) 中，通过为 `FakeSubagentJavaClient` 扩展 `chatRejectError` 和 `executeToolRejectError` 模拟抛错能力。
   - 增加了 `emits SUBAGENT_END with SUBAGENT_MODEL_ERROR and returns structured error when child model call rejects` 用例。
   - 增加了 `emits SUBAGENT_END with SUBAGENT_TOOL_ERROR and returns structured error when child tool execute rejects` 用例。

### 验证结果
在本地重新执行了门禁验证命令，结果如下：
1. 运行 `git diff --check -- agent-runtime/src/subagent/dispatcher.ts agent-runtime/test/subagentDispatcher.test.ts` 无任何格式与空格异常。
2. 运行 `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner`，所有 37 个测试用例（包括 2 个新增用例）全部成功通过。
3. 运行 `pnpm --filter @openharness/agent-runtime typecheck` 编译检查无任何报错，全量类型检查通过。
