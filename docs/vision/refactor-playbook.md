# OpenHarness 重构执行剧本（给开发 Agent 的指令）

> 状态：v1（2026-05-25）
> 适用对象：在本仓库内执行实施工作的 AI 开发 agent（Claude Code / Cursor / 类似工具）。
> 上游策略文档：[`why-agent-projects-fail-to-land.md`](./why-agent-projects-fail-to-land.md)、[`openharness-gap-analysis-and-roadmap.md`](./openharness-gap-analysis-and-roadmap.md)。
> 用法：把"## 给 Agent 的指令"那一节整段复制到你的开发 Agent，作为新会话的首条消息。

---

## 给 Agent 的指令

> **你是 OpenHarness 项目的实施 Agent。当前项目处在"P2 完成、即将进入架构性重构"的窗口。请严格按以下三阶段执行，每一阶段完成前不得开始下一阶段。所有改动遵守 `openspec/AGENTS.md` 的规范，所有 architecture-shift 走 OpenSpec change 流程。**

### 起手必读（一次性）

执行任何代码改动之前，按顺序读完：

1. `openspec/project.md` — 项目约定与边界
2. `openspec/AGENTS.md` — OpenSpec 工作流
3. `CONTEXT.md` — 领域术语
4. `docs/architecture/responsibility_boundary.md` — TS / Java / Frontend 禁止事项
5. `docs/vision/openharness-gap-analysis-and-roadmap.md` — 目标态与差距
6. `docs/vision/refactor-playbook.md` — 本文（你正在读）

读完后用一句话确认理解后再开始。

---

### Phase A：兜底（预算 1–2 天，不得跳过）

目的：在重构 agentLoop 之前补齐 ground truth 与回归保护。Phase A 全部走"直接修改"路径，**不创建 OpenSpec proposal**（依据 `openspec/AGENTS.md` 的 "Skip proposal for: tests for existing behavior / configuration changes / bug fixes"）。例外：A4。

#### A1. 手动 E2E 验证 P2a / P2b（执行，不写代码）

按 `openspec/changes/add-p2a-mcp/tasks.md` 与 `openspec/changes/add-p2b-session-list/tasks.md` 中标 "🟢 立即可做"的手动 E2E 步骤跑一次，把执行截图或日志摘要补到对应 tasks.md 的"manual E2E"项下并打勾。

成功判据：两个 change 的 tasks.md 全部 `[x]`，可以 archive。

#### A2. OpenSpec archive 整理

对每一个状态为 ✅ Complete 的 change（按时间顺序：`implement-p0a-skeleton`、`implement-p0b-hookable`、`add-p1a-provider-adapter`、`add-p1b-persistence`、`add-p2c-auto-compress`，加上 A1 完成后的 `add-p2a-mcp`、`add-p2b-session-list`），逐个执行：

```bash
npx openspec archive <change-id> --yes
```

archive 后跑：

```bash
npx openspec validate --strict --no-interactive
```

确认无报错。

#### A3. 集成测试补强（"tests for existing behavior"，无需 proposal）

在 `integration-tests/test/` 下新增**最小**集成测试，每个文件 ≤80 行，只断言"端到端跑得通 + 不回归"，不追求覆盖率：

- `p1a.integration.test.ts`：跑一次 chat，断言 cacheHints 字段被 Java provider adapter 接收（mock 模式即可）
- `p1b.integration.test.ts`：跑一次 chat，断言 `data/sessions/{tenant}/{conv}.json` 文件被写入
- `p2c.integration.test.ts`：跑超阈值会话，断言 chunk 文件被写入 `data/sessions/{tenant}/{conv}-chunk-1.md`

模板参考 `integration-tests/test/p0a.integration.test.ts`。

成功判据：`pnpm --filter @openharness/integration-tests test` 全绿。

#### A4. P3c policy-mcp-aware（小型 OpenSpec change）

这是真实的安全 gap：当前 PolicyService 对 MCP 来源的工具默认 ALLOW。属于 architecture-touching 改动，必须走 OpenSpec 流程。

执行：

```bash
mkdir -p openspec/changes/add-p3c-policy-mcp-aware/specs/policy
```

按 `openspec/changes/add-p2c-auto-compress/` 的格式产出：

- `proposal.md`：Why（默认 ALLOW 是安全 gap）+ What（PolicyService 收到 `source: "mcp:..."` 时默认 REQUIRE_APPROVAL，可被显式规则放行）+ Impact（Java + 测试）
- `tasks.md`：Java service 改动 + 测试 + 验证
- `specs/policy/spec.md`：`## ADDED Requirements` 一条，至少一个 Scenario

跑 `npx openspec validate add-p3c-policy-mcp-aware --strict --no-interactive` 通过后，等待用户审批，再实施。

#### A5. 真 LLM dev 接入（**Phase B 的 ground truth**）

不创建新 proposal（`add-p1a-provider-adapter` 已经定义了 Anthropic adapter，这里只是开启它）。

具体动作：

1. 在 `backend/src/main/resources/application.yml`（或现有等价配置文件）确认 Anthropic provider 已配置，缺则补；`api-key` 用 `${ANTHROPIC_API_KEY}` 占位。
2. `.env` 加 `ANTHROPIC_API_KEY=...`（**不要 commit**；确保 `.gitignore` 已含 `.env`）。
3. 跑 `agent-runtime` + `backend`，发一条 chat 请求把 `model` 改成 Anthropic 注册的模型名，确认能拿到真实答复。
4. 把这一步的最小 cURL 示例写到 `docs/architecture/dev_runbook.md`（新文件，≤30 行），方便后续手动 E2E。

成功判据：能用真 Anthropic key 跑通一次完整 two-step 流程（即 Phase B 重构前的最后基线）。

---

### Phase B：核心重构（预算 1 周，**严格按 OpenSpec change 执行**）

#### B1. Change 已经起好

OpenSpec change `add-p3a-multi-step-loop` 的 `proposal.md` / `design.md` / `tasks.md` / `specs/agent-loop/spec.md` 已经存在并通过 strict validate。**不要重新生成**，按现有内容实施。

入口：

```bash
npx openspec show add-p3a-multi-step-loop --json --deltas-only | head -60
```

#### B2. 等待审批

等用户在会话中明确说"approved"或"开始实施 add-p3a-multi-step-loop"。**未获审批前不得改任何 .ts 文件。**

#### B3. 按 tasks.md 顺序实施

`openspec/changes/add-p3a-multi-step-loop/tasks.md` 共 7 段。**严格按顺序**完成，每完成一项立刻 `- [x]`：

1. Types & Schema
2. AgentLoop 重构
3. AgentStreamLoop 重构
4. Tests
5. Frontend（可选）
6. Docs
7. Verification（硬门槛）

每完成一段，跑一次 `pnpm --filter @openharness/agent-runtime test` 防止回归。

#### B4. 任务级硬约束

下面这些不是建议，是强制：

- **不得**把 `model: "default"` 字符串改成别的（model router 是下一个 change `add-p3b-cost-and-router` 的范畴，本 change 不做）。
- **不得**改 `cacheHints.ts` 的算法，只能改它的调用频率。
- **不得**修改 `beforeToolUse` 与 Java policy 的契约（form / payload 不变）。
- **不得**触碰 frontend 以外的文件除非 tasks.md 明确列出。
- **不得**绕过 `openspec validate` 直接 commit；7.3 是硬门槛。
- **必须**保留所有现有 SSE 事件名；只能"加字段、加新事件名"，不能"改现有字段语义"。
- **必须**让 `pnpm test`、`pnpm typecheck`、`openspec validate ... --strict` 三个命令同时通过才能宣称完成。

#### B5. 完成后

跑 7.4 的真 LLM 手动 E2E（依赖 A5 的 dev key）。把 trace 日志摘要贴到 tasks.md 第 7.5 项。

archive：

```bash
npx openspec archive add-p3a-multi-step-loop --yes
```

---

### Phase C：在新 loop 上叠加（迭代式，**每个一份新 OpenSpec change**）

Phase B archive 后才进入 Phase C。按下表顺序，**一次只动一个**：

| 顺序 | Change ID | 价值 | 关键不变式 |
|---|---|---|---|
| C1 | `add-p3b-cost-and-router` | usage / cost 写 trace + model router | 不改 loop 形状 |
| C2 | `add-p3d-injection-guard` | tool result 标 `provenance: untrusted` + 边界标记 | 不改 policy 契约 |
| C3 | `add-p4a-context-builder` | 把 cacheHints + compression 折叠为 ContextBuilder pipeline | 现有 cache 命中率不退化 |
| C4 | `add-p4b-prompt-registry` | system prompt / tool description 模板化 + 版本化 | trace meta 加 promptVersion |
| C5 | `add-p4c-tool-protocol` | `edit_file` / `run_command` / `read_file` 协议级工具 | Java 端 sandbox 落地 |

每个 C 项目走完整 OpenSpec 流程：proposal → validate → 等审批 → tasks 实施 → verification → archive。

P3c（policy-mcp-aware）已经在 Phase A 做完，不再重复。

---

### 失败和阻塞处理

- **任何阶段卡住超过 2 次重试** → 停下来，写一段诊断（"我尝试了 X 和 Y，都因 Z 失败"），交还给用户，**不要自动切换技术方案**。
- **如果发现 design 与现实不符**（比如某个 mock 不存在、某条 import 路径错了） → 在对应 change 的 `design.md` 加 "Open Questions" 段记录，不要在 proposal 静默改 spec。
- **如果发现 Phase B 必须修改 `cacheHints.ts` 算法本身** → 停下，开一个新 OpenSpec change 处理，不混在 `add-p3a-multi-step-loop` 里。

### 报告模板（每完成一个阶段贴一次）

```text
✅ Phase {A|B|C{N}} 完成
- 已 archive 的 changes: [...]
- 新增/修改文件数: ...
- pnpm test: 全绿（X tests / Y files）
- pnpm typecheck: 通过
- openspec validate --strict: 通过
- 真 LLM 手动 E2E: {附 stopReason + stepIndex 序列}
- 偏离 design 的地方: {无 / [...] }
- 下一步建议: ...
```

---

## 给项目维护者的备忘（不属于发给 Agent 的部分）

### Phase A 中不创建 proposal 的判定理由

| 任务 | OpenSpec 规则 | 是否需要 proposal |
|---|---|---|
| A1 手动 E2E | "Configuration / runtime verification" | 否 |
| A2 archive | tooling-only | 否 |
| A3 集成测试 | "Tests for existing behavior" | 否 |
| A4 policy-mcp-aware | 安全行为变更 | **是**（小型 change） |
| A5 dev key 接入 | 配置变更，不引入新 capability | 否 |

### 为什么 Phase B 的 change 已经预先生成

普通流程是"用户提出 → Agent 起草 → 验证 → 审批"。本剧本中 `add-p3a-multi-step-loop` 已经由你（项目维护者）协同 Kiro Agent 起草并通过 strict validate，节省 Phase B 起草环节。开发 Agent 直接进入"等审批 → 实施"。

如要修改 proposal/design/spec，正常编辑文件后 `openspec validate add-p3a-multi-step-loop --strict --no-interactive` 即可。

### Phase C 的命名让位约定

原 P3 候选清单中用 `add-p3a-mcp-http`、`add-p3b-mcp-restart` 等占用了 P3a/b/c 编号。本剧本把 P3a/P3b/P3c/P3d 重新分配给"架构性重构"序列：

| 新编号 | 内容 |
|---|---|
| `add-p3a-multi-step-loop` | 多步 loop（本 change） |
| `add-p3b-cost-and-router` | cost meter + model router |
| `add-p3c-policy-mcp-aware` | MCP 来源默认审批（Phase A） |
| `add-p3d-injection-guard` | untrusted content 防御 |

原 MCP 系列建议重命名到 P4：`add-p4d-mcp-http`、`add-p4e-mcp-restart`、`add-p4f-mcp-resources`、`add-p4g-frontend-mcp-status`。在 Phase A 的 archive 步骤前，可一并对未启动的 P3 候选做重命名（如果它们已经写了 proposal 草稿）。
