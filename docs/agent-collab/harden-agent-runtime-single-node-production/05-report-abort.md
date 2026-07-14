# harden-agent-runtime-single-node-production Step 05 Abort Report

文档类型：Implementation Abort Report
日志及版本：2026-07-10 v2（人工门禁解除后的真实执行）

## 结论

**BLOCKED**：两项人工门禁已经满足，Batch 05 已通过 Java Backend 对 `glm-4.7-flash` 发起真实 OpenAI-compatible 请求并生成不可变 production JSON；但 `reasoning` row 未获得可验收的结构化 `reasoningBlocks`，不得判定 PASS。

当前阻塞包含两个相互独立的事实：

1. 真实 reasoning 请求已发出，但后端返回 HTTP 500，row 记录为 `requestSent=true`、`result=blocked`，没有 `reasoningBlocks`；
2. formal harness 的 `evaluateProductionResponse` 没有读取后端 `message.reasoningBlocks`，其结果分支也没有 `reasoning` PASS case；因此即使后端返回结构化 reasoning，当前 harness 也无法形成 PASS evidence。

[05 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/05-brief.md) 明确规定“若必须改代码才能得到 reasoning evidence，本批立即 BLOCKED”。本轮据此停止，未修改 source/test/spec/tasks/plan，未重复真实调用，也未关闭 Gate C。

## 人工门禁

| 门禁 | 实际 | 结论 |
|---|---|---|
| reasoning-capable model id | `glm-4.7-flash`，已加入 Java Gateway 的 zhipu route/models/pricing | PASS |
| Batch 05 真实 Provider 授权 | 用户明确授权 | PASS |
| credential safety | key 由用户在启动后端的终端进程注入；执行者未读取 credential-bearing file、未打印或复制 key | PASS |
| backend health | `http://127.0.0.1:18084/actuator/health` 返回 `{"status":"UP"}` | PASS |

## 修改文件列表

- 新增不可变 raw artifact：[Batch 05 reasoning JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning.json)
- 更新本报告：[05-report-abort.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/05-report-abort.md)

前置、用户授权的模型路由配置已经在本次 formal execution 之前存在：[application.yml](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/resources/application.yml)。本次 executor 未再修改该文件。

未修改 source、tests、OpenSpec、tasks、plan、dashboard 或项目规则。

## Git / 工作区状态

执行前：

- 工作树已有既存 tracked modifications 与 untracked artifacts，全部保留；
- `git diff --cached --name-only` 无输出，staged 区为空；
- Batch 05 JSON 不存在，满足 immutable preflight；
- `glm-4.7-flash` route/models/pricing 已存在于用户授权的前置配置。

执行后：

- staged 区仍为空；
- 本批只新增 Batch 05 JSON，并更新 allow-list 内的 abort report；
- `git diff --check` exit 0；
- 未执行 `git add` / `commit` / `push` / `reset` / `clean` / `archive` / `freeze`。

## Evidence

### Handoff Contract Fingerprint

| 字段 | 值 |
|---|---|
| Contract marker | [status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md) 中唯一有效 block |
| `change_id` | `harden-agent-runtime-single-node-production` |
| `mode` / `approval_status` | `approved-implementation` / `approved` |
| `risk_profile` / `batch_profile` | `strict` / `staged` |
| `current_batch` / `planned_batches` | `5/5` |
| readonly fields changed | no |

### Production command

使用离线 Maven plugin 坐标运行既有 formal runner；参数包含 `--model=glm-4.7-flash` 与 `--reasoning-model=glm-4.7-flash`，不包含 Provider key，也未启用 `--allow-unsafe-real-errors`。

结果：Maven `BUILD SUCCESS`，总时长约 1 分 33 秒；runner 成功写出新的不可变 JSON。Maven 成功只代表 runner 执行完成，不代表 matrix 或 reasoning row PASS。

### Batch 05 JSON 摘要

主证据：[2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning.json)

| 字段 | 实际 |
|---|---|
| `track` | `production` |
| overall `result` | `fail` |
| row count | 9 |
| reasoning model/provider/transport | `glm-4.7-flash` / `zhipu` / `backend-api` |
| reasoning `required` | `true` |
| reasoning `requestHash` | 非空、已脱敏 |
| reasoning `requestSent` | `true` |
| reasoning HTTP status | `500` |
| reasoning blocks | 缺失 |
| reasoning result | `blocked` |
| reasoning duration | `74ms` |
| secret scan | clean，无命中 |

Supporting rows：`sync=pass`、`timeout=pass`；`usage-cost/stream/structured-tool=fail`；`retry/terminal_error/cancellation=blocked`。这些 supporting observations 不改变已由 Batch 03 + 合同 review 固化的 `terminal_error` PASS，也不允许推进 Batch 05 范围外 rows。

## 根因与代码事实

| 代码事实 | 证据 | 影响 |
|---|---|---|
| `resolveReasoningRow` 只检查 `observed.reasoningBlocks` | [OpenAiCompatibleFormalMatrix.java L376-L412](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | blocks 缺失即强制 `blocked` |
| `evaluateProductionResponse` 只提取 content、toolCalls、usage，未读取 `message.reasoningBlocks` | [OpenAiCompatibleFormalMatrix.java L517-L575](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | 后端 reasoning 结构无法进入 evidence |
| PASS switch 仅覆盖 sync/stream/usage-cost/structured-tool | [OpenAiCompatibleFormalMatrix.java L577-L583](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | `reasoning` 默认恒为 false |
| Adapter 已具备 `reasoning_content -> reasoningBlocks` 映射 | [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java) | 缺口位于 formal response evaluator，而非 DTO 目标合同 |

因此当前 harness 的 reasoning PASS 路径在逻辑上不可达。按 Brief 禁止在本批修源码，不能通过重复 Provider 调用解决。

## Step Critical

| 命令 | 结果 |
|---|---|
| focused Maven suite（offline） | exit 0；17 tests / 0 failure / 0 error |
| shared-schema schema tests | exit 0；49/49 PASS |
| active runtime OpenSpec strict validate | exit 0；valid |
| Anthropic deferral OpenSpec strict validate | exit 0；valid；PostHog 网络 flush warning 不影响退出码 |
| Batch 05 JSON shape assertion | JSON 可解析；reasoning `requestSent=true`、`result=blocked`、无 reasoning blocks |
| Batch 05 JSON secret scan | clean，无命中 |
| `git diff --check` | exit 0 |

## 业务验收分层

| 验收层级 | 是否执行 | 结果 | 说明 |
|---|---:|---|---|
| Unit | 是 | PASS | focused Maven 17/17 |
| Schema pipeline | 是 | PASS | 49/49 |
| Backend API | 是 | PASS（仅请求到达） | health UP；reasoning `requestSent=true` |
| Real business | 是 | BLOCKED | HTTP 500，且无可审计 reasoning blocks |
| Gate C promotion | 否 | not applicable | 本批禁止；overall 仍不满足 promotion |

## 子问题覆盖矩阵

| 子问题 | 本批结果 | 边界 |
|---|---|---|
| `reasoning` real row | BLOCKED | 已真实发送，但未保留 reasoning blocks；需要独立源码修复切片 |
| `terminal_error` | accepted PASS unchanged | Batch 03 + 合同 review 为权威证据，不用本批 supporting row 覆盖 |
| `retry` | required-blocked unchanged | 不推进 |
| `cancellation` | required-blocked unchanged | 不推进 |
| Gate C / tasks 3.1、3.2、3.5、3.6 | unchanged | 不关闭、不勾选 |

## BLOCKED 原因与下一 owner

- BLOCKED：formal harness 缺少 reasoning blocks extraction 与 PASS evaluation；当前 Brief 禁止源码修改。
- BLOCKED：本次真实 reasoning 请求返回 HTTP 500，未形成可验收 blocks。
- 下一 owner：`user`。如授权，应由 Governor 先重切一个最小 TDD 修复切片，修复 formal harness 后使用新的 immutable 文件名复跑；不得覆盖本次 JSON。
- 现有 approved OpenSpec change 继续 active；该 harness 修复仍在既有 qualification 范围内，暂不需要新 proposal，但必须先更新 Brief，不得直接在本批越界修改。
