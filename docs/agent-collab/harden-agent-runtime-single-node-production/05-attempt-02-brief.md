# harden-agent-runtime-single-node-production Step 05 Attempt 02 Brief

文档类型：Implementation Brief
日志及版本：2026-07-10 v1
执行角色：Antigravity CLI / external-agent
预计耗时：30m

## 1. 项目路径

唯一实施工作树：[stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)

Canonical 协作状态只读：[status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)

## 2. 任务目标

在不改变产品合同、requiredness 或 Gate C 状态的前提下，修复 formal production harness 的 reasoning evidence evaluator：

1. 将 Java Backend response 中非空的 `message.reasoningBlocks` 保留到 row `observed.reasoningBlocks`；
2. reasoning row 仅在 HTTP 200、blocks 非空且真实请求已发出时为 `pass`；
3. blocks 缺失、HTTP 非 200 或结构不合法时继续 `blocked/fail`，不得使用 content 或 mock 伪造 reasoning；
4. 修复后使用 `glm-4.7-flash` 经 18084 后端执行一次新的真实 Provider rerun，写入新的 immutable JSON。

Attempt 01 的 [BLOCKED JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning.json)、[Abort Report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/05-report-abort.md) 与 [Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-10-harden-agent-runtime-single-node-production-step-05-review.md) 是只读历史，不得覆盖。

本 attempt 只允许推进 `reasoning` row。即使 supporting rows 产生观察结果，也不得推进 `retry`、`cancellation`、tasks 3.1/3.2/3.5/3.6 或 Gate C。

## 2.1 Canonical Handoff Contract

唯一 marker 位于 [canonical status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)，本 Brief 不复制 marker。

| 字段 | 值 |
|---|---|
| `schema_version` | `2` |
| `contract_revision` | `2` |
| `current_batch / planned_batches` | `5 / 5` |
| `attempt` | `2` |
| `lifecycle_state` | `ready-for-execution` |
| `next_owner` | `external-agent` |
| `risk_profile` | `strict` |

执行前若任一指纹不一致，立即写 attempt-specific abort report，不得修改 canonical status。

## 2.2 Evidence Profile

Profile：`strict`

- fake backend 只用于 TDD 证明 evaluator 行为，不能替代真实 Provider evidence。
- 真实 PASS 必须来自 backend API → Zhipu → `glm-4.7-flash` → backend `reasoningBlocks` → formal JSON 的完整链路。
- 不允许把普通 `content` 当作 reasoning。
- 不允许只截取 reasoning row 掩盖 full matrix 的其他 fail/blocked 状态。

## 3. 允许修改的文件

只允许修改或新增：

- [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)
- [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [Attempt 02 immutable JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json)
- [Attempt 02 Report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/05-attempt-02-report.md)
- [Attempt 02 Abort Report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/05-attempt-02-report-abort.md)

## 4. 禁止修改的范围

禁止修改：

- [Canonical status](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)
- [Worktree status mirror](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)
- [application.yml](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/resources/application.yml)
- [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [OpenSpec active change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)
- [Approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Agent Runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime)
- [Frontend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/frontend)
- [Development dashboard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard)
- 任何 Attempt 01 evidence/report/review
- 任何 credential-bearing environment file

禁止行为：

- `git add` / `git commit` / `git push` / `git reset` / `git clean`
- `npx openspec archive`
- `--allow-unsafe-real-errors`
- 读取、source、搜索、截图或输出 credential-bearing environment file
- 在报告、日志或命令行中打印/复制 Provider key
- 修改 required row 合同或把 Gate C 标为通过

## 5. Git / 工作区硬约束

- 执行前记录 `git status --short` 与 `git diff --cached --name-only`。
- staged 非空立即 abort。
- 保留所有既有 dirty/untracked 文件，不回滚、不覆盖、不清理。
- 执行前记录两个允许修改的 source/test 文件 diff；只在已有 diff 基础上追加本 attempt 的最小 hunk。
- 执行后证明新增/修改严格落在第 3 节 allow-list。

## 6. 允许副作用

- Maven 可写 [backend target](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/target) 编译缓存。
- 允许通过用户持有的 18084 后端进行一次 Attempt 02 formal production rerun；不得读取后端进程的 key。
- 允许真实 Zhipu/OpenAI-compatible 调用由既有 full runner 顺序产生；不得开启 unsafe row 注入。
- 允许在仓库外的临时目录保存命令日志；日志同样必须做 secret scan。
- 不允许 executor 启停用户持有的 18084 服务。health 不可达则写 abort report。

## 7. 需求来源

- [Approved plan Task 10](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Provider spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Attempt 01 Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-10-harden-agent-runtime-single-node-production-step-05-review.md)
- 用户授权：允许修改 formal harness 与对应测试，并再次执行真实 Provider 调用。

## 8. 子问题与边界

| 子问题 | 本 attempt 覆盖 | 验证 | 边界 |
|---|---:|---|---|
| reasoning blocks extraction | 是 | focused RED/GREEN | 只改 formal evaluator |
| reasoning PASS oracle | 是 | focused RED/GREEN + real JSON | HTTP 200 + non-empty blocks + request sent |
| Provider HTTP 500 | 仅观察 | real JSON | 若仍发生则 BLOCKED；不扩到 adapter/controller 修复 |
| terminal_error | 否 | prior accepted review | 不重判 |
| retry/cancellation | 否 | 保持 blocked | 不推进 |
| Gate C | 否 | status/tasks negative check | 不 promotion |

## 8.1 Strict 实现细节

### 函数级变更地图

| 文件 | 函数/测试 | 当前行为 | 目标行为 | 消费者 |
|---|---|---|---|---|
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | `evaluateProductionResponse` | 只提取 content/toolCalls/usage；reasoning 默认 false | 提取非空 `message.reasoningBlocks`；reasoning 仅在 HTTP 200 + blocks 非空时 true | `resolveReasoningRow` |
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | `resolveReasoningRow` | blocked 分支才写 `requestSent=true` | 无论成功/失败均记录真实发送；blocks 缺失继续 blocked | production JSON |
| [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) | 新 focused test | 无 production reasoning success regression | fake backend 返回结构化 blocks 时 row pass 且 observed 保留 blocks/requestSent | TDD evidence |

### 数据合同

| 字段 | 类型 | 必须性 | PASS 条件 |
|---|---|---:|---|
| `row.required` | boolean | 是 | `true` |
| `environment.model` | string | 是 | `glm-4.7-flash` |
| `requestHash` | string | 是 | 非空且脱敏 |
| `observed.requestSent` | boolean | 是 | `true` |
| `observed.httpStatus` | integer | 是 | `200` |
| `observed.reasoningBlocks` | array<object> | 是 | 非空；来自 backend response |
| `usage` / `durationMs` | object / integer | 是 | 存在且可审计 |
| `result` | enum | 是 | 全部 oracle 满足才 `pass` |

### 不变量与错误矩阵

| 失败点 | 预期结果 | 是否阻断 |
|---|---|---:|
| RED test 未按预期失败 | abort，不写生产代码 | 是 |
| blocks 缺失或空数组 | reasoning `blocked` | 是 |
| HTTP 非 200 | `fail/blocked`，不得 PASS | 是 |
| 只存在普通 content | `blocked` | 是 |
| real JSON 文件已存在 | abort，不覆盖 | 是 |
| health 不可达 | abort，不启动/读取 key | 是 |
| Provider 仍返回 500 | real business BLOCKED | 是 |
| secret scan 命中 | FAIL，停止 | 是 |
| retry/cancellation 仍 blocked | 本 attempt 可接受；Gate C 仍 blocked | 否 |

### TDD 与 production wiring

- RED 测试名：`formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks`。
- RED 必须断言 reasoning row `result=pass`、`requestSent=true`、`reasoningBlocks` 非空；当前实现应因 blocks 未提取而失败。
- GREEN 只允许在 `evaluateProductionResponse` 提取 blocks、增加 reasoning PASS case，并在 `resolveReasoningRow` 记录 requestSent。
- 不新增兼容 alias、fallback 或 content-as-reasoning。
- Production wiring：formal runner → 18084 `/api/v1/model/chat` → Zhipu adapter → `glm-4.7-flash` → backend `message.reasoningBlocks` → evaluator observed → immutable JSON。

## 9. 必须执行的验证命令

所有仓库命令从 [stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap) 执行。

### Preflight

```bash
git status --short
git diff --cached --name-only
test ! -e docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json
```

### RED

```bash
mvn -o -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest#formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks test
```

必须观察到断言失败，且失败原因是 reasoning row 仍 blocked/未保留 blocks。把 exit 与关键失败写入 Report。

### GREEN

```bash
mvn -o -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest#formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks test
```

### Step critical

```bash
mvn -o -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test
pnpm --filter @openharness/shared-schema test -- schema
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive
git diff --check
```

### 真实 Provider rerun

先从宿主网络验证：

```bash
curl -fsS --max-time 5 http://127.0.0.1:18084/actuator/health
```

仅在 health UP 且 immutable output 不存在时运行：

```bash
mvn -o -f backend/pom.xml -DskipTests -Dspring-boot.run.main-class=org.openharness.backend.qualification.OpenAiCompatibleFormalMatrix -Dspring-boot.run.arguments="--track=production --backend-url=http://127.0.0.1:18084 --provider-name=zhipu --model=glm-4.7-flash --reasoning-model=glm-4.7-flash --output=/Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json" org.springframework.boot:spring-boot-maven-plugin:3.5.9:run
```

### 独立断言与 secret scan

Report 必须记录：

- JSON `track=production`、9 rows；
- reasoning model/provider/transport 正确；
- reasoning `required=true`、`requestSent=true`、HTTP 200、blocks 非空、usage/duration 存在、`result=pass`；
- full matrix overall 的真实值；若不是 PASS，明确哪些 rows 阻断；
- Attempt 01 JSON 未变化；
- 新 JSON 与 Report 的 secret scan 无命中；
- tasks 3.1/3.2/3.5/3.6 仍为 `[ ]`。

## 10. 业务验收标准

| 层级 | 必须 | PASS 条件 |
|---|---:|---|
| Unit | 是 | focused RED/GREEN + full focused suite PASS |
| Schema pipeline | 是 | 49/49 PASS |
| Backend API | 是 | health UP；reasoning requestSent=true |
| Real business | 是 | HTTP 200 + non-empty preserved reasoningBlocks + usage/duration + row PASS |
| Gate C promotion | 否 | 本 attempt 禁止 |

如果真实 Provider 层未通过，Report 必须为 `BLOCKED` 或 `FAIL`；local tests 不能替代。

## 11. Key Assertions

| 断言 | 期望 | 证据 |
|---|---|---|
| TDD RED | 先失败且原因正确 | Attempt 02 Report |
| reasoning request | `requestSent=true` | rerun01 JSON |
| reasoning HTTP | `200` | rerun01 JSON |
| reasoning preservation | non-empty `reasoningBlocks` | rerun01 JSON |
| content-as-reasoning | 0 | source diff + test |
| mock fallback | 0 | report + real environment |
| secret exposure | 0 | scan |
| Attempt 01 overwrite | 0 | file/hash check |
| Gate C close | 0 | status/report |

## 12. 阻塞处理

以下任一情况必须生成 [Attempt 02 Abort Report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/05-attempt-02-report-abort.md)，不得声称 PASS：

- canonical fingerprint 不一致；
- staged 非空；
- RED 未按预期失败；
- 需要修改 allow-list 外源码；
- health 不可达；
- real output 已存在；
- reasoning blocks 仍缺失或 Provider 仍返回 500；
- critical command 失败；
- evidence/log 出现 secret；
- 发生越界修改。

外部 Agent 不得修改 canonical status；在 Report/Abort 中建议 `ready-for-review` 或 `blocked` 即可。

## 13. 质量门禁

```bash
git diff --check -- backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java
```

## 14. 执行报告

执行成功后生成 [Attempt 02 Report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/05-attempt-02-report.md)；阻塞时生成 attempt-specific Abort Report。

Report 必须包含：

- canonical fingerprint：schema v2 / revision 2 / batch 5 / attempt 2；
- 执行前后 Git 状态与 staged 状态；
- RED 失败与 GREEN 通过的真实输出摘要；
- 修改文件和关键 hunk；
- step_critical 逐项 exit；
- real JSON 完整摘要与 secret scan；
- business acceptance 分层；
- 是否偏离 Brief；
- Suggested Review result 与下一状态；
- 明确 Gate C、tasks 与范围外 rows 均未推进。
