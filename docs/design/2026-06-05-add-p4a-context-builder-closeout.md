# ContextBuilder Pipeline Closeout

文档类型：Closeout / Implementation Record  
日志及版本：2026-06-18 v1

## 结论

通过。`add-p4a-context-builder` 已经完整在本地实现、完成测试覆盖并确认可用。

## 背景

在初版骨架中，模型对话调用粗暴地使用全部稳定的会话历史，且仅在最终筛选出的历史列表后追加 Cache Hint，没有对会话进行分层及 Token 预算管理。如果历史长会话超出了模型的单次输入窗口（或耗费巨大成本），系统将发生故障或产生巨大花销。

本次变更旨在引入 Agent Runtime 的 `ContextBuilder` pipeline，对每次模型对话的上下文进行多层动态筛选与 Token 预算控额（MODEL_CONTEXT_BUDGET）：
1. 明确区分不同的上下文层级（Layer），包括压缩摘要层（`compressed_summary`）、长期记忆检索层（`memory_retrieval`）、以及最近对话层（`recent_messages`）；
2. 优先保留稳定的大段压缩摘要与长期事实，对剩余的 Token 预算按时间逆序反向扫描，动态挑选最大可装载的最近活跃对话消息，多余历史进行分层截断；
3. 将选中的 Layer 信息、装载消息数、预估 Token 数以及截断状态作为 `ContextBuildMeta`（`meta.context`）写入模型调用请求并透传，以便审计与分析。

## 核心逻辑

- **分层策略（Layers）**：
  - **Summary 层**：查找具有 `compressedSummary: true` 标记的历史归档消息，将其作为稳定前缀无条件载入（保留老版 `compression.ts` 合成的 summary）；
  - **Memory 层**：载入本轮检索出的 scoped 长期记忆事实（若有），生成 system context 信息；
  - **Recent 层**：提取常规会话消息作为最近对话，根据 `MODEL_CONTEXT_BUDGET_TOKENS` 扣除 Summary 与 Memory 的预估 Token 后，计算剩余预算，按时序从新到旧尽可能多地选择 Recent 消息装载。
- **Budget 控额与溢出防护**：
  - 默认单轮上下文 Token 上限为 8000，可被环境变量 `MODEL_CONTEXT_BUDGET_TOKENS` 覆盖。
  - 特殊边缘防御：当最新的一条 user/assistant 消息的预估 Token 已经直接超出了单次预算时，强制保留最新的一条消息（防止最新交互被完全裁掉），并将状态标为 `truncated: true`。
- **元数据暴露 (Metadata)**：
  - 构造 `ContextBuildResult.meta`，其中含有 `builder: "default"`, `selectedMessages`, `estimatedTokens`, `budgetTokens`, `layers`, `truncated`，并在 `agentExecutionRunner.ts` 将其回写为 `ModelChatRequest.meta.context` 供后端审计。

## 规格与计划

- OpenSpec archive：`openspec/changes/archive/2026-06-05-add-p4a-context-builder/`
- Current specs：
  - `openspec/specs/shared-schema/spec.md`
  - `openspec/specs/agent-runtime/spec.md`
  - `openspec/specs/context-builder/spec.md`
- Superpowers implementation plan：`docs/superpowers/plans/2026-06-05-add-p4a-context-builder.md`
- Development dashboard：`docs/project-dashboard/development-log.json`

## 已完成范围

- **共享契约 (Zod)**：
  - [index.ts:L156](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts#L156) 增加了 `ContextBuildMetaSchema`。
  - `ModelChatRequestMetaSchema` 包含可选的 `context` Zod 定义。
- **ContextBuilder 核心**：
  - [contextBuilder.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/contextBuilder.ts) 实现了多层组装、预算剩余逆序扫描以及最旧溢出防护。
- **集成与重构**：
  - `agentExecutionRunner.ts` 和 `agentLoop.ts` 替换了直接读取 history 历史的逻辑，统一走 `buildModelContext` 获得最终的模型可见消息序列，并在 meta 信息中回写 context 元数据。

## 非目标

- 本次变更不调整底层的 `compression.ts` 归档和 chunk MD 生成的执行时机，只对模型对话前的输入视图做运行时筛选。
- 不在此处处理 provider 缓存的具体匹配，依靠 ContextBuilder 吐出的 Chronological 数组稳定性自然提高 Prompt Cache 命中率。

## TDD 与验证记录

### 单元测试与 TDD

- **Zod 契约测试**：
  - `pnpm --filter @openharness/shared-schema test` 通过，包含测试用例 `parses model chat request context metadata`，验证了 message layers 和 `truncated` 的合法解析。
- **ContextBuilder 核心管线测试**：
  - `pnpm --filter @openharness/agent-runtime test -- contextBuilder` 通过（6 tests）。
  - 测试用例 `retains compressed summary before selected recent messages` 证实了 summary 前缀层在 recent 消息之前安全保留；
  - 测试用例 `selects newest stable messages under budget` 验证了当预算（如 20 tokens）非常有限时，Recent 扫描仅抓取最新的消息，并设置 `truncated = true`；
  - 测试用例 `keeps newest oversized message` 验证了超大最新单条消息强行保留的防御溢出边界；
  - 测试用例 `adds retrieved memory facts` 验证了 memory 层在 Recent 层前以 system 形式嵌入且计入 Token Budget 扣除。

### 全量测试

- `pnpm test` (250 tests passed)。

## 后续建议

- 随着后续 P5b 记忆检索模块落地，可以通过 `buildModelContext` 接收 retrieved facts，这已在 Zod 接口兼容中进行了参数保留。
