# 全量门禁与持久化回归修复设计

日期：2026-08-05

工作区：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness/)
分支：`feat/runtime-progress-panel`

## 1. 背景与边界

当前全量回归的失败集中在四个已定义契约的断裂点：Gate C 测试引用的证据物料缺失、Gate D 诊断器依赖的正式 packet 目录缺失、生产启动 wrapper 缺失，以及 P1b 集成测试仍读取旧的 JSON 路径。

本次目标是恢复当前工作区中已经实现并有既有提交依据的门禁配套，校正过时的测试断言，保留跨租户和跨用户隔离语义。现有未提交改动属于用户工作，除本设计明确的文件外不回滚、不清理、不重写。

本次按 Direct Change 执行：不新增 OpenSpec proposal。依据是修复范围恢复已有实现与已批准契约，主要依据为：[单节点生产变更](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/)、[message-history 变更契约](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/message-history/spec.md) 和 [Gate C provider 规范](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)。

## 2. 根因事实

| 失败 | 事实 | 依据 |
| --- | --- | --- |
| Gate C | 测试复制两份 provider JSON 时发生 `ENOENT`；策略要求的 Codex SHA 与历史已授权物料一致，不能用新内容替代 | [Gate C 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/gateCProviderPolicy.test.ts:151)、[Gate C 策略](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/qualification/gateCProviderPolicy.ts:8) |
| Gate D | `validateFreshDiagnosticPaths` 对两个正式 attempt 目录直接执行 `realpathSync`；当前 checkout 缺少这些既有 packet 目录，导致临时目标尚未进入诊断流程就失败 | [Gate D 诊断器](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts:668) |
| Gate D scripts | package test 要求诊断、preflight、formal run 三个既有脚本，当前 [agent-runtime package](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/package.json) 缺少它们 | [Gate D script 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/gateDPerformanceDiagnostics.test.ts:2708) |
| 生产启动 | 入口实现存在，但启动测试指定的 wrapper 文件不存在 | [生产入口](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/productionEntrypoint.ts:22)、[启动测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/productionStartupScript.test.ts:5) |
| P1b | JSON store 已按 `tenant/user/conversation` 写入，P1b 仍按旧的 `tenant/conversation` 读取；这会制造持久化假失败 | [JSON store](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/jsonFileHistoryStore.ts:25)、[P1b 测试](file:///Users/elvis/file/develop/opensource/openharness/integration-tests/test/p1b.integration.test.ts:51) |

## 3. 方案比较

### 方案 A：恢复既有配套物料并校正测试（采用）

恢复既有提交中已经验证过的 Gate C evidence、Gate D 非 PASS packet、启动 wrapper 和 package scripts；P1b 测试改为断言带 user scope 的路径，并保留文件中的 tenant/user/conversation 元数据。

优点是改动最小、不会改变安全边界或运行时语义，Gate C 的授权 SHA 和 Gate D 的历史证据保持原样。恢复的 Gate D packet 只证明已有 preflight/partial 状态，不把任何历史记录升级为正式 PASS。

### 方案 B：改生产代码绕过缺失目录，并将 Gate C 证据内联为测试 fixture

让 Gate D 在正式目录缺失时跳过路径保护，并把 provider 报告复制到测试 fixture。该方案减少仓库物料，但会改变生产安全前置行为，且容易让测试证据与受授权文件脱钩，不采用。

### 方案 C：把 JSON 存储改回 tenant/conversation 路径

让旧 P1b 断言直接通过，但会删除 user ownership 这一层隔离，违反当前单节点生产持久化契约和跨用户 IDOR 防护，不采用。

## 4. 设计决策

1. 恢复 [Gate C provider evidence 目录](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/) 中测试引用的两份既有 JSON，内容、哈希和 `production`/`blocked` 结果保持历史版本，不生成新的真实 provider 证据。
2. 恢复 [Gate D packet 目录](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/gate-d/) 中已有的 preflight/partial 物料，使路径保护能够解析正式 attempt 边界；不添加新的 24 小时 PASS 或 production promotion 结论。
3. 新增 [生产启动 wrapper](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/scripts/start-production-runtime.sh)，保持 fail-closed 环境变量校验、`umask 077`、production profile 和 reviewed entrypoint。
4. 在 [agent-runtime package](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/package.json) 补齐既有 qualification/diagnostic scripts，不新增运行时能力。
5. 更新 [P1b 集成测试](file:///Users/elvis/file/develop/opensource/openharness/integration-tests/test/p1b.integration.test.ts) 的期望路径为 `HISTORY_DATA_DIR/tenant/user/conversation.json`，并验证 `userId`；不修改 [JsonFileHistoryStore](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/jsonFileHistoryStore.ts)。

## 5. 实施与验证顺序

1. 本设计文档完成自审并单独提交。
2. 以当前已失败测试作为 RED 证据，先补齐缺失物料/配置并校正 P1b 测试断言。
3. 运行 Gate C、Gate D、启动测试和 P1b；若出现新的生产代码缺口，再为该缺口补充最小回归测试后实施 TDD RED/GREEN。
4. 运行 Agent Runtime 全量 Vitest、Frontend、Integration、TypeScript typecheck、Backend Maven、Dashboard freshness 和 OpenSpec strict validation。
5. 对实际 diff 做安全边界、证据真实性、跨用户路径和 scope drift review；结果落盘到 [docs/review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/)。
6. 全量门禁通过后，按功能模块精确暂存、提交和推送；最后确认服务状态与 worktree 状态，再关闭本地 worktree。

## 6. 验收标准

- Gate C provider policy、reconciliation CLI、生产启动 wrapper 和 Gate D 全套测试通过。
- P1b 能从实际写入的 tenant/user scoped JSON 文件读取至少 user 与 assistant 两条稳定消息。
- 不改变 `JsonFileHistoryStore` 的跨租户/跨用户隔离，不引入 JSON 与 SQLite 双写，不把历史 blocked/preflight 证据升级为 PASS。
- Agent Runtime、Frontend、Integration、Backend、typecheck、Dashboard 和 OpenSpec 门禁均有新鲜命令输出。
- Review 文档明确列出 PASS/BLOCK 证据链及未解决的真实外部资格门禁，不以单元测试替代真实 provider/MCP/browser 资格结论。

## 7. 回滚与停止条件

本次变更按文件级精确提交，可通过对应提交回退，不执行 broad reset/clean。若发现需要改变公开持久化契约、Gate D 安全边界、证据授权规则或 SQLite 生命周期语义，立即停止 Direct Change，升级为新的 OpenSpec change，不继续扩大本批次范围。
