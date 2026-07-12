# harden-agent-runtime-single-node-production Step 02 Brief

文档类型：Implementation Brief
日志及版本：2026-07-09 v1
执行角色：Codex（external implementer）
Governor：Codex（按用户指令生成 Batch 02 Brief）；Review 交 Grok/Governor
预计耗时：45-90m；真实 Provider / backend 启动不可用时写 abort report，不硬撑 scope

## 1. 项目路径

唯一实施 worktree（必须在此工作）：

[stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout)

主仓只用于同步协作产物，不得在主仓实施代码：

[openharness](file:///Users/elvis/file/develop/opensource/openharness)

## 2. 任务目标

本步只做一件完整业务切片：

> 使用 Batch 01 已通过 review 的 formal production harness，授权重跑 Zhipu / OpenAI-compatible production matrix，并落盘可复核的真实生产 evidence 与 `02-report.md`。

本步的 PASS 不等于 Gate C PASS。若 retry / terminal_error / cancellation / reasoning 仍无安全真实路径或模型能力不足，应继续 `blocked` 并写明原因；禁止 mock PASS。

本步不是：

- 关闭 Gate C
- 勾选 tasks 3.1 / 3.2 / 3.5 / 3.6
- 修复 provider/runtime 语义缺口，除非先用 RED 证明是 formal harness 自身无法运行的缺陷
- 打开 `--allow-unsafe-real-errors`
- 实施 ChatGPT OAuth
- 把 Anthropic 重新列为 Gate C required
- 推进 Gate B / Gate D / freeze / archive / dashboard verified
- commit / merge / archive / push

## 2.1 Handoff Contract

权威状态：

[status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)

只读字段（禁止改）：`mode`、`approval_status`、`risk_profile`。

<!-- COOP_HANDOFF_CONTRACT_START -->
```yaml
schema_version: 1
change_id: harden-agent-runtime-single-node-production
mode: approved-implementation
approval_status: approved
risk_profile: strict
batch_profile: staged
current_batch: 2
planned_batches: 3
batch_01_review: PASS
batch_02_brief: READY
executor: external-agent
governor: codex-brief-antigravity-review
next_owner: external-agent
collaboration_mode: plan-and-review
step_critical:
  - "mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test"
  - "pnpm --filter @openharness/shared-schema test -- schema"
  - "npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive"
  - "npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive"
  - "formal production harness writes a new Zhipu/OpenAI-compatible production JSON report"
  - "secret canary scan on Batch 02 report and production JSON has no matches"
  - "git -C <worktree> diff --check"
final_critical:
  - "OpenAI-compatible real production matrix report overall PASS (Gate C required family only)"
  - "secret canary scan clean on all new reports"
  - "human Gate C promotion approval (not this batch)"
business_acceptance:
  unit: required
  pipeline: optional
  api: required
  real_business: required
stop_conditions:
  - scope expansion beyond batch brief allow-list
  - checking Gate B/C/D or tasks 3.1/3.2/3.5/3.6 as done without evidence
  - treating Anthropic as Gate C required again
  - implementing add-chatgpt-oauth-auth without separate approval
  - git commit / push / archive / freeze without user command
  - mock PASS for real-provider required rows
  - printing, copying, or committing provider secrets
verification_strategy:
  step: run step_critical each batch; governor review re-runs critical plus one independent behavior check
  final: run final_critical only when OpenAI-compatible real matrix is candidate for Gate C promotion
readonly_fields:
  - mode
  - approval_status
  - risk_profile
workspace: file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout
branch_hint: stage0-runtime-production-closeout
```
<!-- COOP_HANDOFF_CONTRACT_END -->

## 2.2 Evidence Profile

Profile：strict

- 真实 Zhipu 调用是本步核心 evidence；不能用 fake/local 替代。
- fake/local rows 只能作为 harness regression 支撑，不得写成 production PASS。
- 若 credentials、backend、network、provider rate-limit、safe row oracle、或 harness execution 不可用，必须写 `02-report-abort.md` 或 `02-report.md` with `BLOCKED`。
- 缺少 retry / terminal_error / cancellation 的安全真实注入路径时，应写 production row `blocked`，不得打开 unsafe flag 或伪造 pass。

## 3. 允许修改的文件

首选只允许写协作与 evidence 产物：

- [Batch 02 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)
- [Batch 02 abort report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/agent-collab/harden-agent-runtime-single-node-production/02-report-abort.md)
- [Provider verification directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/)
- [Main repo Batch 02 report copy](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)

仅当 formal harness 无法执行且 RED 测试证明是 harness 自身缺陷时，允许最小 TDD 修改：

- [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)
- [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)

若 code path 未修改，不要新增测试，不要重构。

## 4. 禁止修改的范围

禁止修改：

- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 勾选状态
- [defer-anthropic-from-gate-c](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/defer-anthropic-from-gate-c/) 合同语义
- [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/add-chatgpt-oauth-auth/) 及任何 OAuth 实现
- [Frontend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/frontend/)
- [Agent Runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/)
- [OpenSpec archive](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/archive/)
- [Development dashboard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/project-dashboard/)

禁止命令：

- `git add`
- `git commit`
- `git push`
- `git reset`
- `git clean`
- `npx openspec archive`
- 任何会打印 `.env`、API key、authorization token 的命令

## 5. Git / 工作区硬约束

- 执行前必须记录 `git status --short`。
- 若存在 staged 改动，必须停止并写 abort report；不要尝试 unstaging。
- 不得回滚、覆盖或删除批前脏改动。
- 只能新增 Batch 02 evidence/report，或按第 3 节最小 TDD 修 formal harness。
- 完成后记录 `git status --short` 和 `git diff --stat`，明确区分本批新增与批前已有改动。

## 6. 允许副作用

允许：

- 启动本地 backend 服务用于真实 Zhipu production matrix。
- 调用 Zhipu / BigModel 真实 API，限 safe rows：sync、usage-cost、stream、structured-tool、timeout。
- 读取当前 shell 环境变量或 source worktree `.env`，但禁止打印、复制、提交或写入密钥。

服务与端口：

- 首选 backend port `18084`。
- 若端口被占用，选择另一个本地端口并在 report 记录；不得 kill unrelated process。
- 完成后必须 shutdown 本批启动的 backend，并记录 shutdown 方式。

密钥边界：

- 可使用 worktree root 下 `.env`，但不得 `cat`、`rg`、`grep`、`sed`、`nl`、截图或复制 `.env` 内容。
- 只允许做“存在性检查”，例如 source 后 `test -n "${ZHIPU_API_KEY:-}"`，不得 echo value。

## 7. 需求来源

- [status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)
- [01-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md)
- [step-01 review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-harden-agent-runtime-single-node-production-step-01-review.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [defer Anthropic design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/defer-anthropic-from-gate-c/design.md)
- [previous Zhipu production JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)
- [formal local JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-openai-compatible-formal-local.json)

## 8. 子问题列表与覆盖边界

| 子问题 | 本步骤是否覆盖 | 验证方式 | 不覆盖时的说明 |
|---|---|---|---|
| Zhipu safe rows 真实生产重跑 | 是 | formal production JSON + backend/API evidence | 必须真实调用，不可 local 替代 |
| timeout `PROVIDER_TIMEOUT` 不回归 | 是 | production timeout row + `ModelControllerTest` | 若真实 provider 没触发 timeout，应记录 observed gap |
| retry 真实 503 注入 | 否 | row must be `blocked` unless安全路径已明确授权 | 不得启用 unsafe flag |
| terminal_error 真实 invalid/auth mutation | 否 | row must be `blocked` unless安全路径已明确授权 | 不得破坏真实 credential |
| cancellation public production cancel | 否 | row must be `blocked` | 当前无 public chat cancel endpoint |
| reasoning | 仅观测 | glm-4-flash 未证明 reasoning-capable 时继续 blocked | 不得换模型，除非用户显式给 reasoning model |
| Gate C promotion | 否 | report 明确 forbidden | 本批只产证据 |

## 8.1 Strict 实现细节

### 函数级变更地图

| 文件 | 函数/类型 | 当前行为 | 本步目标行为 | 调用方/消费者 |
|---|---|---|---|---|
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | `runProduction` | 生成 production track rows，unsafe rows blocked | 真实 backend + Zhipu safe rows 重跑并写 JSON | CLI / Batch 02 executor |
| [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java) | `/api/v1/model/chat` | provider timeout 返回 structured `PROVIDER_TIMEOUT` | 不回归；不改代码除非 harness defect RED | formal harness |
| [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/AuthFilter.java) | service auth | requires the configured service token and identity headers | harness 通过 service token 调用 backend | formal harness |

### 数据合同

| 字段 | 类型 | 可选性 | 生产者 | 消费者 |
|---|---|---:|---|---|
| `track` | `"production"` | 否 | formal harness | shared-schema / reviewer |
| `result` | `pass` / `fail` / `blocked` | 否 | formal harness | Gate C reviewer |
| `rows[].id` | string | 否 | formal harness | reviewer |
| `rows[].requestHash` | SHA-256 hex | 否 | formal harness | audit |
| `rows[].observed.httpStatus` | number | safe rows 是 | backend/API response | reviewer |
| `rows[].observed.requestSent` | boolean | unsafe rows 是 | formal harness | reviewer |
| `rows[].observed.blockedReason` | string | blocked rows 是 | formal harness | reviewer |
| `rows[].usage` | object | usage rows 可选 | backend/API response | reviewer |
| `rows[].cost` | object | cost rows 可选 | backend/API response | reviewer |

### 不变量与错误矩阵

| 不变量 / 失败点 | 预期 | 是否阻断 | 必须证据 |
|---|---|---:|---|
| `.env` missing `ZHIPU_API_KEY` | abort/BLOCKED，不跑 fake PASS | 是 | `02-report-abort.md` |
| backend 启动失败 | abort/BLOCKED | 是 | report command output summary |
| safe row 真实调用失败 | report `fail` 或 `blocked`，不得修 runtime | 是 | production JSON |
| retry/terminal/cancel 无安全路径 | row `blocked`, `requestSent=false` | 否 | production JSON |
| timeout 非 structured | report `fail`，不得关闭 Gate C | 是 | production JSON + tests |
| secret scan 命中 | FAIL，停止 | 是 | scan output |
| tasks 被勾选或 Gate C 被关闭 | FAIL | 是 | tasks/status diff |

### TDD 与生产 wiring

- 本步默认不写代码，因此不要求 RED/GREEN。
- 若 formal harness 无法执行且需要修改第 3 节允许的 harness 文件：
  - RED：先在 [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) 增加失败测试。
  - GREEN：仅修 [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)。
  - 禁止修改 runtime provider 行为；该类缺陷进入 Batch 03。
- 生产 wiring：formal harness -> backend `/api/v1/model/chat` -> `ModelRouter` -> Zhipu `OpenAiCompatibleAdapter` -> BigModel real API -> backend structured response -> production JSON。

## 9. 必须执行的验证命令

所有命令从 [stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout) 执行。

### Preflight

```bash
git status --short
```

```bash
test -f .env
set +x
set -a
. ./.env
set +a
test -n "${ZHIPU_API_KEY:-}"
```

### Start backend

```bash
set +x
set -a
. ./.env
set +a
SERVER_PORT=18084 mvn -f backend/pom.xml spring-boot:run
```

后台服务启动后，另一个 shell 验证：

```bash
curl -fsS http://127.0.0.1:18084/actuator/health
```

### Run production formal matrix

```bash
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json
test ! -e "$REPORT"
mvn -f backend/pom.xml -DskipTests spring-boot:run -Dspring-boot.run.main-class=org.openharness.backend.qualification.OpenAiCompatibleFormalMatrix -Dspring-boot.run.arguments="--track=production --backend-url=http://127.0.0.1:18084 --provider-name=zhipu --model=glm-4-flash --output=../$REPORT"
```

### Critical commands

```bash
mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test
```

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

```bash
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
```

```bash
npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive
```

```bash
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.env.REPORT,'utf8')); const rows=Object.fromEntries(r.rows.map(x=>[x.id,x])); const must=['openai-zhipu-sync','openai-zhipu-usage-cost','openai-zhipu-stream','openai-zhipu-structured-tool','openai-zhipu-timeout','openai-zhipu-retry','openai-zhipu-terminal-error','openai-zhipu-cancellation','openai-zhipu-reasoning']; if(r.track!=='production') throw new Error('track not production'); if(!['pass','fail','blocked'].includes(r.result)) throw new Error('invalid result'); for (const id of must) if(!rows[id]) throw new Error('missing '+id); for (const id of ['openai-zhipu-retry','openai-zhipu-terminal-error','openai-zhipu-cancellation']) { if(rows[id].result!=='blocked') throw new Error(id+' must stay blocked without safe injection'); if(rows[id].observed.requestSent!==false) throw new Error(id+' must not send unsafe request'); } console.log(JSON.stringify({track:r.track,result:r.result,rowCount:r.rows.length},null,2));"
```

```bash
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json
rg -n "ZHIPU_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|Bearer [A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]+" "$REPORT" docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md
```

Expected for secret scan: exit 1, no matches.

```bash
git diff --check
```

## 10. 业务验收标准

| 验收层级 | 是否必须 | 验证方式 | PASS 条件 |
|---|---:|---|---|
| 单元测试 | 是 | Maven focused | 12 tests pass |
| schema pipeline | 是 | shared-schema schema tests | 49 tests pass |
| server/API | 是 | backend health + formal harness through `/api/v1/model/chat` | backend responds; JSON rows produced |
| 真实业务问题 | 是 | Zhipu production JSON | safe rows真实执行；blocked rows不 mock PASS；secret scan clean |
| Gate C promotion | 否 | 不执行 | report 明确 still blocked / not promoted |

Batch 02 PASS 条件：

- 新 production JSON 落盘。
- JSON `track=production`。
- Rows 包含 9 个 expected OpenAI-compatible row ids。
- sync / usage-cost / stream / structured-tool / timeout 必须展示真实 backend/provider observed evidence；若任一失败，report 不得声称 Gate C 可推进。
- retry / terminal_error / cancellation 在没有安全真实注入授权时必须 `blocked` 且 `requestSent=false`。
- reasoning 对 `glm-4-flash` 未证明 reasoning-capable 时必须 `blocked`。
- No secret leakage。
- Gate C 不关闭，tasks 不勾选。

## 11. Key Assertions

| 断言 | 期望 | 证据产物 |
|---|---|---|
| Formal production JSON exists | yes | [providers directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/) |
| `track` | `production` | Batch 02 JSON |
| Expected rows | 9 rows present | Batch 02 JSON |
| unsafe rows | `blocked`, `requestSent=false` | Batch 02 JSON |
| timeout | `PROVIDER_TIMEOUT` / `structuredStatus=504` if timeout row succeeds | Batch 02 JSON |
| secrets | 0 matches | secret scan |
| tasks 3.1/3.2/3.5/3.6 | still `[ ]` | [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) |

## 12. 阻塞处理

写 [02-report-abort.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/agent-collab/harden-agent-runtime-single-node-production/02-report-abort.md) 或在 [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md) 标记 `BLOCKED`，当且仅当：

- `ZHIPU_API_KEY` 不存在或不可用。
- backend 无法启动或健康检查失败。
- provider/network/rate-limit 阻止 safe rows 完成。
- formal harness 无法生成 JSON 且无法在 allowed scope 内 TDD 修复。
- secret scan 命中。
- 有 staged 改动或工作区状态无法安全划界。

Abort / BLOCKED report 必须写清：

- 执行前后 `git status --short`
- 哪个命令失败
- 是否启动 backend，是否已停止
- 是否产生部分 JSON
- 没有泄露密钥
- 下一步需要用户 / Grok / Codex 做什么

## 13. 质量门禁

```bash
git diff --check
```

如果改了 harness 代码，额外运行：

```bash
git diff --check -- backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java
```

## 14. 执行报告

完成后生成：

- [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)
- 同步一份到 [main repo 02-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)

Report 必须包含：

- 结论：`PASS` / `BLOCKED` / `FAIL`
- 修改文件列表
- `git status --short` 前后状态
- backend 启动端口、PID/session、shutdown 结果
- production JSON 路径
- row summary table：sync、usage-cost、stream、structured-tool、timeout、retry、terminal_error、cancellation、reasoning
- real provider call yes/no
- retry / terminal_error / cancellation 是否 requestSent=false
- secret scan 命令与结果
- step_critical 命令与 exit
- 是否改代码；若改代码，RED/GREEN 记录
- 是否勾 tasks / 关闭 Gate C / commit / archive：必须为否
- 下一步建议：Batch 03 是否需要 evidence-backed fix 或 Gate C candidate package
