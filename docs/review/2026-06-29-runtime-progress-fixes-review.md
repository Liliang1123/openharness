# 2026-06-29 Runtime Progress Fixes Review

## 结论
`通过`

## Review 范围
本 review 评审了为支持运行时进度面板以及修复 trace 插队和审批死锁问题所做的一系列修改，涉及的文件如下：
- 后端逻辑：
  - [agent-runtime/src/runtimeProgress.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/runtimeProgress.ts)
  - [agent-runtime/src/server.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/server.ts)
- 前端逻辑：
  - [frontend/src/runtimeProgress.ts](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/runtimeProgress.ts)
  - [frontend/src/RuntimeProgressPanel.tsx](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/RuntimeProgressPanel.tsx)
  - [frontend/src/api.ts](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/api.ts)
  - [frontend/src/App.tsx](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/App.tsx)
  - [frontend/src/App.css](file:///Users/elvis/file/develop/opensource/openharness/frontend/src/App.css)
- 测试文件：
  - [agent-runtime/test/runtimeProgress.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/runtimeProgress.test.ts)
  - [frontend/test/runtimeProgress.test.ts](file:///Users/elvis/file/develop/opensource/openharness/frontend/test/runtimeProgress.test.ts)

## 主要发现
1. **语义事件过滤机制（`latestActivityEvent`）的引入**：
   - 倒序遍历事件流，查找第一个匹配核心语义（如 `model_call_start`, `tool_call` 等）的事件来决定 `currentActivity`。这有效避免了非关键内部 trace 事件插入时重置活动为 `idle` 的问题。
2. **前端审批死锁状态解除**：
   - 原先使用全局 `some(approval_requested)` 的做法是不对的，因为审批恢复后历史事件流中仍有该事件。现在改为判定最新语义事件是否为 `approval_requested`，随着恢复后新事件（如 `tool_call`、`model_call_start` 等）的追加，状态能够正常退回到 `running`，避免锁死。
3. **前端 reason 白名单提取对齐**：
   - 提取 `event.data.reason` 保证了前后端状态数据结构的一致性，且有效规避了如工具原始参数 `argumentsRaw` 等潜在敏感信息的泄露风险。
4. **回归测试覆盖度**：
   - 前后端新增了 4 + 6 个回归测试案例，涵盖普通 trace 穿插测试、审批状态转移测试、数据屏蔽及白名单数据提取验证。所有测试用例在本地执行均已全部通过。

## 最终建议
本次修复设计简洁合理，解决了状态机在特定事件流顺序下的边缘行为（如穿插 trace 导致回退 idle，和审批通过后无法退出等待状态）。建议：
- 无需进一步修改，同意此部分修复内容合入。

## 后续门禁
- 是否需要 OpenSpec proposal：不需要（已有 active `add-runtime-progress-panel` proposal，本次为对其 review 过程中的修复）。
- 是否需要 Superpowers plan：不需要额外计划。
- 后续流程：在人工 UI 复核或集成测试通过后，即可对 `add-runtime-progress-panel` 执行 OpenSpec 归档（`npx openspec archive add-runtime-progress-panel --yes`），并同步更新 dashboard 状态至 `archived`。
