# harden-agent-runtime-single-node-production Step 03 Brief

文档类型：Implementation Brief
日志及版本：2026-07-09 v1
执行角色：Codex（external implementer）
Governor：Codex（按用户指令生成 Batch 03 Brief）；Review 交 Grok/Governor
预计耗时：90-150m；真实 Provider / 安全注入 / backend 启动不可用时写 `03-report.md` with `BLOCKED` 或 `03-report-abort.md`

## 1. 项目路径

唯一实施 worktree（必须在此工作）：

[stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)

主仓只用于同步协作产物，不得在主仓实施代码：

[openharness](file:///Users/elvis/file/develop/opensource/openharness)

## 2. 任务目标

本步只做一个完整业务切片：

> 在 Batch 01 formal harness 与 Batch 02 Zhipu production re-run 已通过 review 的基础上，尝试用 **安全、可审计、真实 OpenAI-compatible provider evidence** 消除 Gate C 剩余 blocker：`retry`、`terminal_error`、`cancellation`、`reasoning`。若任何 blocker 没有安全真实路径，必须继续 `blocked` 并写清原因，禁止 mock PASS。

Batch 03 的实现 review 可以 PASS，但这 **不等于 Gate C PASS**。只有当 primary production JSON overall `pass`、所有 required OpenAI-compatible rows `pass`、secret scan clean、且后续 human Gate C promotion approval 通过时，Gate C 才能进入关闭讨论。本批 implementation 不得自行 promotion。

本步不是：

- 关闭 Gate C
- 勾选 tasks 3.1 / 3.2 / 3.5 / 3.6
- 打开未设计清楚的 unsafe real error injection
- 用 fake/local/代理/mock 结果替代真实 Provider required row
- 新增 public model cancellation API
- 修改 ChatGPT OAuth / Anthropic required policy / Gate B / Gate D / freeze / archive / dashboard verified
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
current_batch: 3
planned_batches: 3
batch_01_review: PASS
batch_02_brief: READY
batch_02_review: PASS
batch_03_brief: READY
executor: external-agent
governor: codex-brief-antigravity-review
next_owner: external-agent
collaboration_mode: plan-and-review
step_critical:
  - "mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test"
  - "pnpm --filter @openharness/shared-schema test -- schema"
  - "npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive"
  - "npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive"
  - "formal production harness writes a new Batch 03 Zhipu/OpenAI-compatible production JSON report"
  - "secret canary scan on Batch 03 report and production JSON has no raw secret matches"
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
workspace: file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap
branch_hint: stage0-runtime-production-closeout
```
<!-- COOP_HANDOFF_CONTRACT_END -->

## 2.2 Evidence Profile

Profile：strict

- 真实 Zhipu / OpenAI-compatible evidence 是本步核心；fake/local 只能作为 regression 支撑。
- 每个 required row 必须明确 `track`、`environment.transport`、`requestHash`、`observed`、`oracle`、`durationMs`、`result`。
- 如果 row 没有真实安全路径，必须保留 `blocked`；不得把 provider docs、fake server、proxy、sandbox、unit test、或人工判断写成 production PASS。
- 允许产出 Gate C candidate package；但 implementation agent 不得 promotion。

## 3. 允许修改的文件

首选允许修改协作与 evidence 产物：

- [Batch 03 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)
- [Batch 03 abort report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/03-report-abort.md)
- [Provider verification directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/)
- [Main repo Batch 03 report copy](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)

允许在 TDD 下做最小 implementation/harness 修改：

- [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)
- [OpenAiFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [ProviderUnavailableException.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/ProviderUnavailableException.java) 或同目录下一个 narrowly-scoped provider terminal exception class，仅当 RED 证明需要结构化 terminal provider errors

若未改 runtime/code path，不要新增无关测试，不要重构。

## 4. 禁止修改的范围

禁止修改：

- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 勾选状态
- [defer-anthropic-from-gate-c](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/defer-anthropic-from-gate-c/) 合同语义
- [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-chatgpt-oauth-auth/) 及任何 OAuth 实现
- [Frontend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/frontend/)
- [Agent Runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/)
- [OpenSpec archive](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/)
- [Development dashboard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/)
- public model cancellation endpoint 或新 API contract
- provider credential files, `.env`, shell history, IDE settings

禁止命令：

- `git add`
- `git commit`
- `git push`
- `git reset`
- `git clean`
- `npx openspec archive`
- `cat` / `rg` / `grep` / `sed` / `nl` / screenshot `.env`
- 任何会打印 API key、authorization token、或 `.env` 值的命令

## 5. Git / 工作区硬约束

- 执行前必须记录 `git status --short`。
- 执行前必须记录 `git diff --cached --name-only`；若有 staged 改动，停止并写 abort report。
- 不得回滚、覆盖或删除批前脏改动。
- 只能新增 Batch 03 evidence/report，或按第 3 节 TDD 修改 allowed implementation files。
- 完成后记录 `git status --short` 与 `git diff --stat`，明确区分本批新增与批前已有改动。

## 6. 允许副作用

允许：

- 启动本地 backend 服务用于真实 Zhipu production matrix。
- 调用 Zhipu / BigModel 真实 API，限 Batch 03 明确 row：safe baseline rows、terminal-error bounded safe mutation（若实现并证明安全）、reasoning model row（若有明确模型）、cancellation adapter-level real attempt（若实现并证明安全）。
- 读取当前 shell 环境变量或 source worktree `.env`，但禁止打印、复制、提交或写入密钥。

服务与端口：

- 首选 backend port `18084`。
- 若端口被占用，选择另一个本地端口并在 report 记录；不得 kill unrelated process。
- 完成后必须 shutdown 本批启动的 backend，并记录 shutdown 方式。

真实错误注入边界：

- `retry`：只有 provider 自然返回 503，或 provider 官方支持的安全测试触发方式，才可 `requestSent=true`。不得使用 mock/proxy/本地 fake server 作为 production PASS。
- `terminal_error`：允许最多一次 bounded invalid-request/model mutation，前提是它不修改 credential、不使用无效 key、不造成资源创建/删除、不包含用户数据或秘密，并且 report 写明为什么安全。若 backend routing 无法把 invalid model 发给 provider，则不得伪造。
- `cancellation`：不得新增 public API。若只能做 adapter-level real-provider cancellation，必须记录 `environment.transport=adapter-real-provider`，并在 report 明确这是否足以作为 Gate C candidate 仍需 Governor 判定。
- `reasoning`：只允许使用已配置或由用户显式提供的 reasoning-capable OpenAI-compatible model；不得猜测模型能力。无模型时保持 blocked。

密钥边界：

- 可 source worktree root 下 `.env`，但不得读取或展示其内容。
- 只允许做存在性检查，例如 source 后检查变量非空；不得 echo value。

## 7. 需求来源

- [status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)
- [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)
- [step-02 review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-harden-agent-runtime-single-node-production-step-02-review.md)
- [Batch 02 primary production JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [defer Anthropic design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/defer-anthropic-from-gate-c/design.md)
- [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)

## 8. 子问题列表与覆盖边界

| 子问题 | 本步骤是否覆盖 | 验证方式 | 不覆盖时的说明 |
|---|---|---|---|
| Batch 02 safe rows 不回归 | 是 | Batch 03 production JSON | sync / usage-cost / stream / structured-tool / timeout 必须仍可审计 |
| timeout `PROVIDER_TIMEOUT` 不回归 | 是 | production timeout row + `ModelControllerTest` | 非 structured timeout 是 FAIL |
| retry real 503 | 尝试 | provider-natural/doc-supported 503 only | 无安全 503 时必须 blocked + `requestSent=false` |
| terminal_error safe real path | 尝试 | bounded safe invalid-request/model mutation + structured evidence | 无安全路径或 backend 无法路由 invalid request 时 blocked |
| cancellation real path | 尝试 | adapter-level real-provider cancellation evidence 或 blocked | 不新增 public cancel API；若非 backend transport，必须标注 review 风险 |
| reasoning | 尝试 | reasoning-capable model returns preserved reasoning block | 没有明确模型或 provider 不返回 reasoning content 时 blocked |
| Gate C promotion | 否 | report 明确 forbidden | 本批不勾 tasks、不关 Gate C |

## 8.1 Strict 实现细节

### 函数级变更地图

| 文件 | 函数/类型 | 当前行为 | 本步目标行为 | 调用方/消费者 |
|---|---|---|---|---|
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | `runProduction` | safe rows real pass；retry/terminal/cancel/reasoning blocked | 增加安全真实路径探测；不可安全执行的 row 保持 blocked | CLI / Batch 03 executor |
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | `ProductionOptions` / CLI parse | `allowUnsafeRealErrorInjection` 存在但不授权 unsafe PASS | 可新增安全 opt-in 参数；默认必须 safe/blocked | formal matrix CLI |
| [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java) | `/api/v1/model/chat` | timeout/unavailable structured；其他 provider runtime exception 可能裸 500 | 仅在 RED 证明后规范化 provider terminal error，不影响 timeout | formal production backend row |
| [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java) | `chat` / `callWithRetry` / `cancel` | retry, timeout, terminal and cancel local paths exist | 仅做证据所需最小结构化/observability 修复 | ModelController / formal harness |

### 数据合同

| 字段 | 类型 | 可选性 | 生产者 | 消费者 |
|---|---|---:|---|---|
| `track` | `"production"` | 否 | formal harness | shared-schema / reviewer |
| `result` | `pass` / `fail` / `blocked` | 否 | formal harness | Gate C reviewer |
| `rows[].id` | string | 否 | formal harness | reviewer |
| `rows[].required` | boolean | 否 | formal harness | reviewer |
| `rows[].environment.transport` | string | 否 | formal harness | reviewer |
| `rows[].requestHash` | SHA-256 hex | 否 | adapter/backend | audit |
| `rows[].observed.requestSent` | boolean | blocked/unsafe rows 必须 | formal harness | reviewer |
| `rows[].observed.blockedReason` | string | blocked rows 必须 | formal harness | reviewer |
| `rows[].observed.errorClass` | string | error rows 必须 | backend/adapter/harness | reviewer |
| `rows[].observed.structuredStatus` | number | structured backend error 必须 | backend/harness | reviewer |
| `rows[].usage` | object | usage rows 可选 | backend/API response | reviewer |
| `rows[].cost` | object | cost rows 可选 | backend/API response | reviewer |

### 不变量与错误矩阵

| 不变量 / 失败点 | 预期 | 是否阻断 | 必须证据 |
|---|---|---:|---|
| Missing provider API key | abort/BLOCKED，不跑 fake PASS | 是 | `03-report-abort.md` |
| backend 启动失败 | abort/BLOCKED | 是 | report command output summary |
| safe row 回归 | report `fail`，不得关闭 Gate C | 是 | Batch 03 JSON |
| timeout 非 structured | report `fail` | 是 | Batch 03 JSON + tests |
| retry 无真实 503 | row `blocked`, `requestSent=false` | 否 | Batch 03 JSON |
| terminal_error 只能靠 invalid key | 禁止；row blocked | 否 | Batch 03 JSON |
| cancellation 只能靠 public API | 禁止新增 API；row blocked 或 adapter-level supporting evidence | 否 | Batch 03 JSON |
| reasoning model 不明确 | row blocked | 否 | Batch 03 JSON |
| secret scan 命中 | FAIL，停止 | 是 | scan output |
| tasks 被勾选或 Gate C 被关闭 | FAIL | 是 | tasks/status diff |

### TDD 与生产 wiring

本步若改代码，必须使用 RED/GREEN：

- RED：先在 [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) 或 [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) 增加失败测试。
- GREEN：只改第 3 节 allow-list 内最小代码。
- 任何新增 CLI option 必须有 test 证明 default 行为仍 safe blocked，不会因为 flag 存在而 mock PASS。
- 生产 wiring：
  - backend path：formal harness -> backend `/api/v1/model/chat` -> `ModelRouter` -> Zhipu `OpenAiCompatibleAdapter` -> BigModel real API -> backend structured response -> production JSON。
  - adapter-level path（仅 cancellation/terminal/reasoning 必要时）：formal harness -> `OpenAiCompatibleAdapter` with real Zhipu config -> BigModel real API -> production JSON；必须明确标注 `environment.transport=adapter-real-provider`。

## 9. 必须执行的验证命令

所有命令从 [stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap) 执行。

### Preflight

```bash
git status --short
```

```bash
git diff --cached --name-only
```

```bash
test -f .env
set +x
set -a
. ./.env
set +a
test -n "${ZHIPU_API_KEY:-}"
```

```bash
test ! -e docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json
```

若文件已存在，不得覆盖；使用 `batch03-rerunNN.json` 新文件名并在 report 说明。

### RED/GREEN（如改代码）

```bash
mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,ModelControllerTest test
```

必须在 report 写明：

- 新增哪个 RED 测试。
- RED 时观察到的失败。
- GREEN 后同一测试通过。
- 哪些 row 仍 blocked 以及原因。

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
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json
test ! -e "$REPORT"
mvn -f backend/pom.xml -DskipTests spring-boot:run -Dspring-boot.run.main-class=org.openharness.backend.qualification.OpenAiCompatibleFormalMatrix -Dspring-boot.run.arguments="--track=production --backend-url=http://127.0.0.1:18084 --provider-name=zhipu --model=glm-4-flash --output=../$REPORT"
```

如新增安全 opt-in 参数，只能用于本 Brief 明确允许的 safe rows，并必须在 report 逐项说明。禁止使用会把 unsafe row 伪造成 PASS 的参数。

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
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.env.REPORT,'utf8')); const rows=Object.fromEntries(r.rows.map(x=>[x.id,x])); const must=['openai-zhipu-sync','openai-zhipu-usage-cost','openai-zhipu-stream','openai-zhipu-structured-tool','openai-zhipu-timeout','openai-zhipu-retry','openai-zhipu-terminal-error','openai-zhipu-cancellation','openai-zhipu-reasoning']; if(r.track!=='production') throw new Error('track not production'); if(!['pass','fail','blocked'].includes(r.result)) throw new Error('invalid result'); for (const id of must) if(!rows[id]) throw new Error('missing '+id); for (const id of ['openai-zhipu-sync','openai-zhipu-usage-cost','openai-zhipu-stream','openai-zhipu-structured-tool','openai-zhipu-timeout']) { if(rows[id].result!=='pass') throw new Error(id+' safe row regression'); } for (const id of ['openai-zhipu-retry','openai-zhipu-terminal-error','openai-zhipu-cancellation','openai-zhipu-reasoning']) { if(!['pass','blocked','fail'].includes(rows[id].result)) throw new Error(id+' invalid result'); if(rows[id].result==='pass' && rows[id].observed && rows[id].observed.requestSent===false) throw new Error(id+' cannot pass without requestSent evidence'); if(rows[id].result==='blocked' && !(rows[id].observed && rows[id].observed.blockedReason)) throw new Error(id+' blocked row needs reason'); } console.log(JSON.stringify({track:r.track,result:r.result,rowCount:r.rows.length},null,2));"
```

```bash
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json
rg -n "Bearer [A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}" "$REPORT" docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md
```

Expected for secret scan: exit 1, no matches.

```bash
git diff --check
```

## 10. 业务验收标准

| 验收层级 | 是否必须 | 验证方式 | PASS 条件 |
|---|---:|---|---|
| 单元测试 | 是 | Maven focused | focused tests pass |
| schema pipeline | 是 | shared-schema schema tests | 49 tests pass |
| server/API | 是 | backend health + formal harness through `/api/v1/model/chat` | backend responds; production JSON produced |
| 真实业务问题 | 是 | Batch 03 Zhipu production JSON | safe rows pass；remaining rows either real PASS with evidence or blocked with reason |
| Gate C promotion | 否 | 不执行 | report 明确 still not promoted |

Batch 03 implementation PASS 条件：

- `03-report.md` 落盘，并同步主仓副本。
- 新 production JSON 落盘；不得覆盖 Batch 02 evidence。
- JSON `track=production`，包含 9 个 expected OpenAI-compatible row ids。
- Batch 02 safe rows不回归。
- 每个剩余 row 不得 mock PASS：
  - PASS 必须有真实请求/真实响应/可审计 oracle。
  - BLOCKED 必须有 `blockedReason`。
  - unsafe 或未证明路径必须 `requestSent=false`。
- Secret scan clean。
- Gate C 不关闭，tasks 不勾选，未 commit/archive/push。

## 11. Key Assertions

| 断言 | 期望 | 证据产物 |
|---|---|---|
| Batch 03 JSON exists | yes | [providers directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/) |
| `track` | `production` | Batch 03 JSON |
| Expected rows | 9 rows present | Batch 03 JSON |
| safe rows | all pass | Batch 03 JSON |
| timeout | `PROVIDER_TIMEOUT` / `structuredStatus=504` | Batch 03 JSON |
| retry/terminal/cancel/reasoning | pass only with real evidence; otherwise blocked | Batch 03 JSON |
| secrets | 0 raw-secret matches | secret scan |
| tasks 3.1/3.2/3.5/3.6 | still `[ ]` | [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) |

## 12. 阻塞处理

写 [03-report-abort.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/03-report-abort.md) 或在 [03-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md) 标记 `BLOCKED`，当且仅当：

- provider API key 不存在或不可用。
- backend 无法启动或健康检查失败。
- provider/network/rate-limit 阻止 safe rows 完成。
- retry / terminal_error / cancellation / reasoning 没有安全真实路径。
- formal harness 无法生成 JSON 且无法在 allowed scope 内 TDD 修复。
- secret scan 命中。
- 有 staged 改动或工作区状态无法安全划界。

Abort / BLOCKED report 必须写清：

- 执行前后 `git status --short`
- 哪个命令失败
- 是否启动 backend，是否已停止
- 是否产生部分 JSON
- 没有泄露密钥
- 哪些 row 仍 blocked 以及下一步需要用户 / Grok / Codex 做什么

## 13. 质量门禁

```bash
git diff --check
```

如果改了代码，额外运行：

```bash
git diff --check -- backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java backend/src/main/java/org/openharness/backend/api/ModelController.java backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java backend/src/main/java/org/openharness/backend/service/provider/ProviderUnavailableException.java
```

## 14. 执行报告

完成后生成：

- [03-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)
- 同步一份到 [main repo 03-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)

Report 必须包含：

- 结论：`PASS` / `BLOCKED` / `FAIL`
- 修改文件列表
- `git status --short` 前后状态
- backend 启动端口、PID/session、shutdown 结果
- production JSON 路径
- row summary table：sync、usage-cost、stream、structured-tool、timeout、retry、terminal_error、cancellation、reasoning
- 每个剩余 blocker 的路径判定：real PASS / blocked / fail 及理由
- real provider call yes/no；`environment.transport` summary
- secret scan 命令与结果
- step_critical 命令与 exit
- 是否改代码；若改代码，RED/GREEN 记录
- 是否勾 tasks / 关闭 Gate C / commit / archive：必须为否
- 若 JSON overall `pass`：明确写“仅为 Gate C candidate evidence，仍需 human promotion approval”
- 若 JSON overall `blocked`：明确写下一步是扩展 batch / 修改 contract / 等用户提供 reasoning model / Provider 能力，而不是强行 promotion
