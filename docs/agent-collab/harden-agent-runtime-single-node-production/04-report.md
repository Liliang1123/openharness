# Batch 04 Report — Contract Alignment for remaining Gate C rows

## 结论

PASS（审计产出完成；Gate C 仍整体 `blocked`，不得 promotion）。

## 结论摘要

| 项 | 结果 |
|---|---|
| `terminal_error` | pass（`adapter-real-provider`，HTTP 400）— 合同口径待确认 |
| `retry` | required-blocked（`requestSent=false`，无安全 real-path） |
| `cancellation` | required-blocked（`requestSent=false`，无 public cancel contract） |
| `reasoning` | required-blocked（无 reasoning-capable model） |
| `planned_batches` 扩展 | `3 -> 4` 仅协作合同延展，不是 Gate C 产品降级 |
| Gate C | 未关闭，仍 forbidden |

## 参照范围

- [04-brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/04-brief.md)
- [status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)
- [03-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)
- [step-03-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-10-harden-agent-runtime-single-node-production-step-03-review.md)
- [batch03 JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json)

## 修改文件

- [04-report.md（worktree）](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md)
- [04-report.md（main）](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md)

## 执行前后 Git 状态

### 执行前

`git -C /Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout status --short`

已有批次遗留改动与未跟踪文件；其中包括本次工作域内先前生成的验证、review、设计与批次文档；未见 staged 变更。

### 执行后

仅新增/同步了 [04-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md) 与主仓对应副本；未新增任何代码或源码变更。
Staging 依然为空。

`git -C /Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout diff --cached --name-only`
结果：无输出（仍无 staged 文件）。

`git -C /Users/elvis/file/develop/openharness/.worktrees/stage0-runtime-production-closeout diff --check -- docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md`
结果：`exit 0`（无 whitespace / patch issues）。

## 依赖 evidence（batch03）

`batch03` 主证据文件：[2026-07-09-zhipu-openai-compatible-production-formal-batch03.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json)

- `track=production`
- `result=blocked`
- `rows=9`
- Safe rows + timeout: `openai-zhipu-sync` / `openai-zhipu-usage-cost` / `openai-zhipu-stream` / `openai-zhipu-structured-tool` / `openai-zhipu-timeout` 均为 `pass`
- `terminal_error`: `openai-zhipu-terminal-error` 为 `pass`，`transport=adapter-real-provider`，`providerHttpStatus=400`，`errorClass=RuntimeException`，`errorMessageClassified=provider_error_400`
- `retry` / `cancellation` / `reasoning` 三行 `result=blocked`，`requestSent=false`，并带 `blockedReason`

## Step 4 行为契约审计表

| Row | 是否 required（当前 spec） | 本批 03 证据状态 | 当前 Gate C 合同判断 | 是否需 OpenSpec amendment | 说明 |
|---|---|---|---|---|---|
| `terminal_error` | 是 | `pass`（adapter-real-provider / `requestSent=true`） | 先标记 `pass-candidate`；待产品明确是否接受 `adapter` 路径作为 Gate C 实际覆盖 | 不立即需要；若产品要求仅 `/api/v1/model/chat` 覆盖则需 amendment |
| `retry` | 是 | `blocked`（`requestSent=false`） | `required-blocked` | 否（保持 required） | 无 mock PASS、无安全 real 503 注入；不得收敛为 pass |
| `cancellation` | 是 | `blocked`（`requestSent=false`） | `required-blocked` | 否（保持 required）；若要求降级为 optional/能力条件则需要 amendment | 目前无 public cancel 契约 |
| `reasoning` | 是 | `blocked`（`requestSent=false`） | `required-blocked` | 否（保持 required）；若要降级为 model-availability gating 则需 amendment | 未提供 reasoning-capable model（`glm-4-flash` 未显式认定） |

## Gate C 当前影响

- `overall` 结论：`blocked`（因 `retry/cancellation/reasoning`）
- Gate C close：**禁止**，`openai` 仅 required family 仍未 complete
- 该批不产生新的 production matrix 与 backend/API 运行改变；不触发 promotion、任务勾选、archive、commit/merge

## 下一步最小切片建议

1. 先在 brief/Governor 会议内确认 `terminal_error` 的合同口径：
   - 接受 `adapter-real-provider` 作为 Gate C terminal row 语义；或
   - 继续要求 backend-api 路径可验证，则另开小 batch 增加专用 probe。
2. `retry`：补齐生产可用、非 mock 的安全 503 注入/供应商原生路径证据，保留 `requestSent=true` 与 `blockedReason` 结构化字段。
3. `cancellation`：明确 public cancel 契约并补齐真实路径证据；否则继续 required-blocked。
4. `reasoning`：提供已确认的 reasoning-capable 模型并复跑 required row；否则保留 blocked。
5. 全部 row resolved 后，单独提交 evidence-backed 的 promotion decision 包。

## Step_critical 与执行退出码

按 04-brief 约定，当前批未新增代码，主要采用既有 batch03 产物做结构断言，并补跑 full step_critical 验证：

```bash
REPORT=/Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.env.REPORT,'utf8')); const rowMap=Object.fromEntries(r.rows.map(x=>[x.id,x])); const required=['openai-zhipu-retry','openai-zhipu-cancellation','openai-zhipu-reasoning']; if(r.track!=='production'||r.result!=='blocked') process.exit(1); if(rowMap['openai-zhipu-terminal-error'].result!=='pass') process.exit(2); for(const id of required){ if(rowMap[id].result!=='blocked' || !rowMap[id].observed?.blockedReason) process.exit(3);} console.log('assert ok')"
```

结果：`exit 0`（track=production、overall=blocked、terminal pass、3 blocked）。

### 本批 step_critical 执行（实测）

- `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test`
  - 结果：`exit 0`，`17` tests / `0` fail / `0` error
  - 说明：测试运行期间 `OpenAiFakeProviderMatrixTest` 中 cancellation/terminal_error/retry 用例通过，确认并发 cancel 可审计。
- `pnpm --filter @openharness/shared-schema test -- schema`
  - 结果：`exit 0`，`49` tests passed
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`
  - 结果：`exit 0`（command reported `Change ... is valid`）
  - 说明：出现 PostHog 网络 flush 警告（无可达边界），未影响命令退出码
- `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive`
  - 结果：`exit 0`（command reported `Change ... is valid`）
  - 说明：同样出现 PostHog flush 警告，不影响退出码
- `git diff --check -- docs/agent-collab/harden-agent-runtime-single-node-production/04-report.md`
  - 结果：`exit 0`

## 边界确认

- 未改代码
- 未改 spec / tasks
- 未跑真实 provider
- 未读取/打印 `.env`
- 未勾选 3.1 / 3.2 / 3.5 / 3.6
- 未关 Gate C
- 未 commit / push / archive / freeze
