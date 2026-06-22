# add-skill-invocation-sandbox Review

## 结论

需修改：新 OpenSpec change `add-skill-invocation-sandbox` 可以通过 `openspec validate`，Dashboard 生成校验也通过；但前一阶段 `add-runtime-cache-stability` 归档后的 TS Runtime 单测当前并未通过，closeout 中“195 tests passed”与实际验证不一致。新阶段 proposal 还存在主执行入口、Provider capabilities 传递、`invoke_skill` 暴露/授权边界、商业文件 shredding 安全边界不清等设计风险，暂不建议进入代码实施。

## Review 范围

- 前一阶段归档与收尾：
  - `docs/design/2026-06-22-add-runtime-cache-stability-closeout.md`
  - `docs/superpowers/plans/2026-06-22-add-runtime-cache-stability.md`
  - `openspec/changes/archive/2026-06-22-add-runtime-cache-stability/**`
  - `openspec/specs/cache-hints/spec.md`
  - `openspec/specs/context-builder/spec.md`
  - `openspec/specs/prompt-registry/spec.md`
  - `openspec/specs/agent-runtime/spec.md`
- 新 OpenSpec change：
  - `openspec/changes/add-skill-invocation-sandbox/proposal.md`
  - `openspec/changes/add-skill-invocation-sandbox/design.md`
  - `openspec/changes/add-skill-invocation-sandbox/tasks.md`
  - `openspec/changes/add-skill-invocation-sandbox/specs/agent-loop/spec.md`
  - `openspec/changes/add-skill-invocation-sandbox/specs/provider-adapter/spec.md`
- Dashboard：
  - `docs/project-dashboard/development-log.json`
  - `docs/project-dashboard/development-log.md`
  - `docs/project-dashboard/index.html`

## 主要发现

### 🔴 bug: 归档 closeout 声称单测全过，但当前正式重跑失败

- 位置：`docs/design/2026-06-22-add-runtime-cache-stability-closeout.md:63`
- 证据：非沙箱授权重跑 `pnpm --filter @openharness/agent-runtime test` 后，结果为 `1 failed | 35 passed (36)`，`192 passed / 195`，失败集中在 `agent-runtime/test/agentExecutionRunner.test.ts` 3 个断言。
- 失败原因：`injectSessionContextIfNeeded()` 新增的 session context 改变了 model-call message 顺序，但既有 `AgentExecutionRunner` 测试未同步更新或实现未按既有层级契约兼容。
- 修复：先修正实现或测试预期，再更新 closeout；未恢复 195/195 前不要把 `add-runtime-cache-stability` 标为可合并完成。

### 🔴 bug: session context 注入使用 `default`，未使用 selected Agent Definition model

- 位置：`agent-runtime/src/agentExecutionRunner.ts:158`, `agent-runtime/src/prompts/registry.ts:66-75`
- 问题：`AgentExecutionRunner` 调用 `injectSessionContextIfNeeded(...)` 时没有传入 `this.selectedModel(input)`，因此 session context 总是写 `Current model: default`。
- 影响：当 `agentDefinition.model` 为 `fast-model` 等非默认模型时，模型可见上下文与实际 `ModelChatRequest.model` 不一致。
- 修复：调用处传入 selected model，并补测试覆盖非默认 model。

### 🔴 bug: 新 change 仍以 `AgentLoop` 为验收入口，偏离当前服务主路径

- 位置：`openspec/changes/add-skill-invocation-sandbox/proposal.md:9`, `design.md:19`, `specs/agent-loop/spec.md:17`, `tasks.md:9`
- 问题：当前 `server.ts` 使用 `AgentExecutionRunner` 作为实际 HTTP/SSE 执行入口；proposal/tasks/spec 主要写 `agentLoop.ts` / `AgentLoop.run()`。
- 影响：即使按 proposal 实施，也可能只覆盖 legacy path，真实服务路径不生效。
- 修复：把验收入口改为 `AgentExecutionRunner`，必要时抽共享 helper；测试应覆盖 `POST /api/v1/agent/chat` 或 `AgentExecutionRunner` 主路径。

### 🔴 design gap: `ProviderMessageCapabilities` 在 Java provider adapter 声明，但 TS 注入决策拿不到该能力

- 位置：`openspec/changes/add-skill-invocation-sandbox/proposal.md:10`, `design.md:26`, `specs/provider-adapter/spec.md:5-18`
- 问题：Provider adapter 当前是 Java backend 概念，而 pending injection 的 assistant/user fallback 决策发生在 TS Runtime 发起 model call 前。proposal 未定义 TS 如何获得 resolved provider 的 capabilities。
- 影响：TS 无法可靠决定是否允许 synthetic assistant injection，Alternating Roles 门禁不可实现。
- 修复：补充跨运行时契约：例如 Java `/model/capabilities` 查询、catalog/meta 返回、或 TS 侧按 logical model 配置 capabilities；同时加入 `shared-schema` / `backend-gateway` delta。

### 🔴 design gap: `invoke_skill` 如何进入模型可见 Tools Schema 未定义

- 位置：`openspec/changes/add-skill-invocation-sandbox/proposal.md:9`, `specs/agent-loop/spec.md:7-12`
- 问题：模型只有在 tools schema 中看到 `invoke_skill` 才能调用；当前 proposal 未说明该元工具由 Java catalog、TS synthetic tool、MCP tool，还是 Agent Definition allow-list 注入。
- 影响：可能出现模型不可调用、catalogHash 不稳定、或 `assertToolCallsAllowed()` 在 `beforeToolUse` 前先拒绝 `invoke_skill`。
- 修复：明确 `invoke_skill` 的 schema 来源、catalogHash 稳定策略、Agent Definition allow-list 规则，以及与 `beforeToolUse` 的执行顺序。

### 🟡 risk: Shredding 需求缺少路径安全边界，安全语义过强

- 位置：`openspec/changes/add-skill-invocation-sandbox/design.md:28-34`, `specs/agent-loop/spec.md:23-36`
- 问题：`shredFile(path)` 若直接接收文件路径，需要规定只能处理受控 skill cache 根目录内的普通文件，禁止 symlink/path traversal/hardlink 风险；且 APFS/SSD/COW 下覆盖写并不保证物理块抹除。
- 修复：spec 中增加 root confinement、`lstat` 普通文件检查、拒绝 symlink、失败审计日志；将安全目标表述为“best-effort logical cleanup”，商业强敏感材料优先采用加密存储 + key deletion。

### 🟡 process: Dashboard 链接了不存在的 plan 文件

- 位置：`docs/project-dashboard/development-log.json:36`, `docs/project-dashboard/development-log.md:55`
- 问题：Dashboard 指向 `docs/superpowers/plans/2026-06-22-add-skill-invocation-sandbox.md`，但该文件不存在。
- 约束：按项目规则，未经 OpenSpec 批准的方案不得放入 `docs/superpowers/plans/` 作为可执行计划。
- 修复：proposal 阶段先移除 plan 链接，或等用户明确批准 OpenSpec 后再创建 Superpowers implementation plan 并同步 Dashboard。

## 验证记录

```bash
npx openspec validate add-skill-invocation-sandbox --strict --no-interactive
```

结果：通过。

```text
Change 'add-skill-invocation-sandbox' is valid
```

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
```

结果：通过。

```text
✅ Dashboard generated outputs are current
📊 28 entries (13 archived, 14 partial)
```

```bash
pnpm --filter @openharness/agent-runtime test
```

结果：失败。沙箱外重跑排除端口监听限制后仍失败：

```text
Test Files  1 failed | 35 passed (36)
Tests       3 failed | 192 passed (195)
```

失败用例：

- `AgentExecutionRunner > builds budgeted model context and reports context metadata`
- `AgentExecutionRunner > prepends versioned system prompt to model calls without persisting it`
- `AgentExecutionRunner > retrieves scoped memory facts for model context when memory store is configured`

## 最终建议

1. 先回到 `add-runtime-cache-stability` 修复当前 3 个真实单测失败，并更正 closeout 证据。
2. 修改 `add-skill-invocation-sandbox` proposal：主入口改为 `AgentExecutionRunner`，补齐 `invoke_skill` tools schema 来源、Agent Definition allow-list、Provider capabilities 跨运行时获取方式、shredding 安全边界。
3. 在用户批准新 OpenSpec 后，再创建 `docs/superpowers/plans/2026-06-22-add-skill-invocation-sandbox.md`，不要在 proposal 阶段提前挂不存在的 plan 链接。

## 后续门禁

- 当前不建议进入代码实施。
- 必须先恢复 `pnpm --filter @openharness/agent-runtime test` 全绿。
- 新 proposal 修改后重跑：
  - `npx openspec validate add-skill-invocation-sandbox --strict --no-interactive`
  - `node docs/project-dashboard/scripts/render-dashboard.mjs`
  - `pnpm dashboard:check`
- 用户明确批准 proposal 后，才进入 Superpowers implementation plan 与代码实施。
