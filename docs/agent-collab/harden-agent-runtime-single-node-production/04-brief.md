# harden-agent-runtime-single-node-production Step 04 Brief

文档类型：Implementation Brief
日志及版本：2026-07-10 v1
执行角色：Codex（external implementer）
Governor：Codex/Grok（review only）
预计耗时：45-75m；本批是合同口径与后续证据路径审计，不跑真实 Provider，不实现代码

## 1. 项目路径

唯一实施 worktree（必须在此工作）：

[stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)

主仓只用于同步协作产物：

[openharness](file:///Users/elvis/file/develop/opensource/openharness)

## 2. 任务目标

本步只做一个完整业务切片：

> 基于 Batch 01-03 PASS evidence，产出 Gate C OpenAI-compatible remaining rows 的合同口径审计包，明确 `terminal_error`、`retry`、`cancellation`、`reasoning` 对 Gate C 的当前验收状态、是否仍 required、若要降级/延期是否需要 OpenSpec amendment，以及下一步最小可执行证据路径。

本 Brief 已把协作合同从 `planned_batches: 3` 扩展为 `planned_batches: 4`，只表示协作流继续；它不等于产品合同降级，也不授权 Gate C promotion。

本步必须保守确认：

- `terminal_error`：Batch 03 adapter-real-provider evidence 可作为 candidate；是否接受为最终 Gate C row 语义必须在 report 中显式判定，不能默认为 backend-api 已覆盖。
- `retry`：仍 required-blocked；无 provider-natural 或官方安全 503 路径时不能 PASS。
- `cancellation`：仍 required-blocked；无 public/product cancel contract 时不能 PASS，且本批不得新增 API。
- `reasoning`：仍 required-blocked；无 reasoning-capable model id 时不能 PASS。若建议降级为 capability-conditional，必须标为 OpenSpec amendment proposal need，不得直接改 spec。

本步不是：

- 关闭 Gate C
- 勾选 tasks 3.1 / 3.2 / 3.5 / 3.6
- 修改 OpenSpec spec/task/proposal/design
- 修改 runtime/backend/frontend 代码
- 跑真实 Provider 或读取 `.env`
- 新增 public cancellation API
- commit / push / archive / dashboard verified

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
current_batch: 4
planned_batches: 4
batch_01_review: PASS
batch_02_brief: READY
batch_02_review: PASS
batch_03_brief: READY
batch_03_review: PASS
batch_04_brief: READY
executor: external-agent
governor: codex-brief-antigravity-review
next_owner: external-agent
collaboration_mode: plan-and-review
step_critical:
  - "mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test"
  - "pnpm --filter @openharness/shared-schema test -- schema"
  - "npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive"
  - "npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive"
  - "Batch 04 contract report classifies terminal_error/retry/cancellation/reasoning without closing Gate C"
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

- 本批不新增 provider evidence；它审计现有 Batch 03 evidence 与合同口径。
- Mock/local/unit evidence 不得替代 real required rows。
- “建议降级 / 建议延期 / 建议 capability-conditional”只能作为 report 结论，不能直接改 OpenSpec。
- 如果无法给出清晰 row-by-row 结论，report 必须 `BLOCKED`。

## 3. 允许修改的文件

只允许新增或修改：

- [04-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md)
- [04-report-abort.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report-abort.md)
- [Main 04-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md)

## 4. 禁止修改的范围

禁止修改：

- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [defer-anthropic-from-gate-c](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/defer-anthropic-from-gate-c/)
- [backend source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/)
- [backend tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/)
- [Frontend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/frontend/)
- [Agent Runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/)
- [OpenSpec archive](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/)
- [Development dashboard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/)
- `.env` or any credential-bearing file

禁止命令：

- `git add`
- `git commit`
- `git push`
- `git reset`
- `git clean`
- `npx openspec archive`
- `cat` / `rg` / `grep` / `sed` / `nl` / screenshot `.env`
- 任何真实 Provider 调用或会打印 API key/token 的命令

## 5. Git / 工作区硬约束

- 执行前必须记录 `git status --short`。
- 执行前必须记录 `git diff --cached --name-only`；若有 staged 改动，停止并写 abort report。
- 不得回滚、覆盖或删除批前脏改动。
- 不得修改本 Brief、status、tasks 或 OpenSpec 语义文件。
- 完成后记录 `git status --short` 与 `git diff --stat`，明确本批只新增/sync 04-report。

## 6. 允许副作用

允许：

- 读取 docs、OpenSpec、source/test 文件用于口径审计。
- 运行本 Brief 第 9 节验证命令。

不允许：

- source `.env`
- 启动 backend
- 访问外部 Provider
- 修改代码或 spec

## 7. 需求来源

- [status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)
- [03-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)
- [step-03 review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-10-harden-agent-runtime-single-node-production-step-03-review.md)
- [Batch 03 JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

## 8. 子问题列表与覆盖边界

| 子问题 | 本步骤是否覆盖 | 验证方式 | 不覆盖时的说明 |
|---|---|---|---|
| Extend collaboration batches | 是 | status/brief contract says `planned_batches: 4` | 只影响协作，不改产品 Gate C |
| Accept terminal adapter evidence | 是 | 04-report row decision table | 只能判定 candidate/accepted/requires backend follow-up |
| retry requiredness | 是 | 04-report decision | 默认仍 required；降级需 OpenSpec amendment |
| cancellation requiredness | 是 | 04-report decision | 默认仍 required；public API 需新/修订 OpenSpec |
| reasoning requiredness | 是 | 04-report decision | 默认仍 required；无 model 时 blocked |
| Gate C close | 否 | report must state forbidden | overall blocked 时禁止 |

## 8.1 Strict 实现细节

### 函数级变更地图

本批不改代码。审计对象：

| 文件 | 函数/类型 | 当前行为 | 本步目标行为 | 调用方/消费者 |
|---|---|---|---|---|
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | production matrix rows | Batch 03 safe + terminal pass, 3 blocked | 仅审计 row semantics | 04-report |
| [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md) | required row semantics | any required row fail/blocked vetoes Gate C | 判断是否需要 amendment | 04-report |

### 数据合同

04-report 必须包含：

| 字段 | 类型 | 必须性 | 说明 |
|---|---|---:|---|
| `contractExtension` | text/table | 是 | planned_batches 3 -> 4，仅协作续接 |
| `rowDecisions` | table | 是 | terminal/retry/cancel/reasoning each row |
| `gateCImpact` | text/table | 是 | 是否仍 blocked，是否可 promotion |
| `openspecAmendmentNeeded` | yes/no per row | 是 | 是否需要新 change 或 amendment |
| `nextSliceRecommendation` | ordered list | 是 | 后续最小可执行切片 |

### 不变量与错误矩阵

| 不变量 / 失败点 | 预期 | 是否阻断 | 必须证据 |
|---|---|---:|---|
| row still blocked but report says Gate C pass | FAIL | 是 | 04-report |
| report downgrades required row directly | FAIL | 是 | 04-report / diff |
| tasks checked | FAIL | 是 | tasks grep |
| spec changed | FAIL unless separately approved | 是 | git diff |
| no clear next slice | BLOCKED | 是 | 04-report |

### TDD 与生产 wiring

- 本批不做代码 TDD。
- 本批不跑 production wiring。
- 若执行者认为必须改 code/spec 才能回答，停止并写 `04-report-abort.md`，不要自行扩 scope。

## 9. 必须执行的验证命令

所有命令从 [stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap) 执行。

### Preflight

```bash
git status --short
```

```bash
git diff --cached --name-only
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
REPORT=docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.env.REPORT,'utf8')); const rows=Object.fromEntries(r.rows.map(x=>[x.id,x])); const required=['openai-zhipu-retry','openai-zhipu-cancellation','openai-zhipu-reasoning']; if(r.track!=='production') throw new Error('track not production'); if(r.result!=='blocked') throw new Error('batch03 must remain blocked'); if(rows['openai-zhipu-terminal-error'].result!=='pass') throw new Error('terminal must be pass'); for (const id of required) { if(rows[id].result!=='blocked') throw new Error(id+' must remain blocked'); if(!rows[id].observed?.blockedReason) throw new Error(id+' missing blockedReason'); } console.log(JSON.stringify({track:r.track,result:r.result,terminal:rows['openai-zhipu-terminal-error'].result,blocked:required},null,2));"
```

```bash
rg -n "^- \\[[ x]\\] 3\\.[1256]" openspec/changes/harden-agent-runtime-single-node-production/tasks.md
```

Expected: 3.1 / 3.2 / 3.5 / 3.6 all remain `[ ]`.

```bash
git diff --check
```

## 10. 业务验收标准

| 验收层级 | 是否必须 | 验证方式 | PASS 条件 |
|---|---:|---|---|
| 单元测试 | 是 | Maven focused | tests pass |
| schema pipeline | 是 | shared-schema schema tests | tests pass |
| server/API | 否 | 不启动 backend | 本批不新增 provider evidence |
| 真实业务问题 | 是 | 04-report row contract table | 明确 remaining rows required/blocked/amendment need |
| Gate C promotion | 否 | 不执行 | report 明确 forbidden |

Batch 04 implementation PASS 条件：

- 04-report 落盘并同步主仓副本。
- row-by-row 决策清晰，不把 blocked 当 pass。
- 明确 planned_batches 扩展只影响协作合同。
- 明确是否需要 OpenSpec amendment；若需要，只建议不实施。
- Gate C 不关闭，tasks 不勾选，未改 spec/code。

## 11. Key Assertions

| 断言 | 期望 | 证据产物 |
|---|---|---|
| Collaboration batch extension | `planned_batches=4` | status / this Brief |
| terminal_error | candidate PASS with adapter-real-provider caveat | 04-report |
| retry | still required-blocked unless amendment proposed | 04-report |
| cancellation | still required-blocked unless amendment proposed | 04-report |
| reasoning | still required-blocked unless model/amendment proposed | 04-report |
| Gate C | still forbidden | 04-report |
| tasks | 3.1/3.2/3.5/3.6 `[ ]` | grep output |

## 12. 阻塞处理

写 [04-report-abort.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report-abort.md) 或在 [04-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md) 标记 `BLOCKED`，当且仅当：

- Handoff Contract 不一致或不可解析。
- Batch 03 report/review/JSON 缺失。
- 无法明确 row-by-row 合同影响。
- 发现 spec/tasks 已被越权修改。
- critical commands 无法完成。

## 13. 质量门禁

```bash
git diff --check -- docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md
```

## 14. 执行报告

完成后生成：

- [04-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md)
- 同步一份到 [main repo 04-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md)

Report 必须包含：

- 结论：`PASS` / `BLOCKED` / `FAIL`
- 修改文件列表
- `git status --short` 前后状态
- Batch 03 evidence summary
- row contract decision table：terminal_error / retry / cancellation / reasoning
- 是否需要 OpenSpec amendment
- next slice recommendation
- step_critical 命令与 exit
- 是否改代码/spec/tasks/Gate C：必须为否
