# Batch 03 Implementation Report

## 结论

PASS（implementation batch）：按 [03-brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/03-brief.md) 完成 remaining blocker 的 **evidence-backed** 处理与新 production formal JSON 落盘。

**Gate C 仍不得关闭**：primary JSON overall `result=blocked`。
safe rows 不回归；`terminal_error` 通过 **adapter-real-provider** 真实 invalid-model 探测变为 `pass`（`providerHttpStatus=400`）；`retry` / `cancellation` / `reasoning` 仍 `blocked` 且有原因，**无 mock PASS**。

本报告同步：

- Worktree: [03-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)
- Main: [03-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/03-report.md)

## 修改文件

| 文件 | 说明 |
|---|---|
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | Batch 03：retry/terminal/cancel/reasoning 解析；bounded invalid-model terminal probe；CLI `--adapter-*` / env 注入（密钥不写 report） |
| [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) | RED/GREEN：terminal probe 400 → pass；无 adapter key → blocked |
| [batch03.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json) | 新增 production evidence |
| 本 report | worktree + main 副本 |

未改：tasks 勾选、Frontend、Agent Runtime、OAuth、Anthropic Gate C 合同、dashboard verified。

## TDD

- **RED 意图**：新增 terminal probe 测试在 harness 尚无 `resolveTerminalErrorRow` 时无法编译/失败。
- **GREEN**：实现 adapter-level invalid-model probe；`formalProductionHarnessPassesSafeTerminalErrorViaAdapterWhenProviderReturns400` pass；`formalProductionHarnessBlocksTerminalErrorWhenAdapterProbeKeyMissing` pass。
- Focused Maven：`OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest` → **14 tests / 0 failures**.

## Production Evidence

Primary:

[2026-07-09-zhipu-openai-compatible-production-formal-batch03.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch03.json)

| Field | Value |
|---|---|
| track | `production` |
| result | **`blocked`** |
| generatedAt | `2026-07-09T16:08:18.130959Z` |
| rows | 9 |
| real provider call | **yes**（safe rows via backend→Zhipu；terminal via adapter→Zhipu） |

| Row | Result | Path / 理由 |
|---|---|---|
| sync | pass | backend-api real Zhipu |
| usage-cost | pass | backend-api real Zhipu |
| stream | pass | backend-api real Zhipu |
| structured-tool | pass | backend-api real Zhipu tool `lookup` |
| timeout | pass | `PROVIDER_TIMEOUT` / `structuredStatus=504` / `timeoutSeen=true` |
| retry | **blocked** | `requestSent=false`；无安全真实 503 注入；禁止 mock/proxy PASS |
| terminal_error | **pass** | `transport=adapter-real-provider`；`requestSent=true`；invalid model `openharness-matrix-invalid-model-do-not-use`；`providerHttpStatus=400`；`errorMessageClassified=provider_error_400`；单次探测、无 credential mutation |
| cancellation | **blocked** | `requestSent=false`；无 public cancel endpoint；adapter interrupt 不作为 Gate C production cancel PASS |
| reasoning | **blocked** | `requestSent=false`；未提供 `OPENHARNESS_REASONING_MODEL` / `--reasoning-model`；`glm-4-flash` 不默认视为 reasoning-capable |

### terminal_error 安全说明

- Backend 会把不在 provider model list 的 model 重映射为配置内真实模型，**无法**经 `/api/v1/model/chat` 可靠送出 invalid model。
- Batch 03 使用 **adapter-real-provider**：`ProviderConfig.models` 仅含 invalid probe id，真实 key 调 Zhipu Chat Completions。
- 禁止 invalid API key 探测（brief 明确禁止）。
- Report/JSON **不**写入 raw provider body 或 API key。

## Backend lifecycle

| Item | Value |
|---|---|
| port | `18084` |
| health | `{"status":"UP"}` |
| start | `SERVER_PORT=18084 mvn -f backend/pom.xml spring-boot:run`（source `.env`，不打印密钥） |
| harness | `OpenAiCompatibleFormalMatrix --track=production ...`（env 注入 `ZHIPU_API_KEY` 仅进程内） |
| shutdown | SIGINT/SIGTERM/KILL on listener PID；final `18084` **not listening** |

## Step critical

| Command | Result |
|---|---|
| `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test` | exit 0；**14** tests / 0 failures |
| `pnpm --filter @openharness/shared-schema test -- schema` | exit 0；49 tests |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | exit 0 |
| `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | exit 0 |
| JSON shape assertion (brief node script) | exit 0；`track=production result=blocked rowCount=9` |
| secret scan on batch03 JSON | exit 1；no matches |
| `git diff --check` | exit 0 |
| tasks 3.1 / 3.2 / 3.5 / 3.6 | still `[ ]` |

Secret canaries scanned: authorization bearer prefixes, common sk- prefixes, dotted long tokens, provider key env names, probe key literals (values never written).

## Boundary confirmation

- 未勾选 tasks 3.1 / 3.2 / 3.5 / 3.6
- 未关闭 Gate C；未 promotion / archive / freeze / dashboard verified
- 未 commit / stage / push / reset / clean
- 未实施 OAuth；未把 Anthropic 设为 Gate C required
- 未打印 / 读取 `.env` 内容
- 未新增 public cancellation API
- 未开 Batch 04

## 下一步（给 Governor / 用户）

1. **Grok Review** 本 report + batch03 JSON。
2. Gate C overall 仍 **blocked**。要候选 overall PASS，仍需：
   - **retry**：provider-natural / 官方支持的安全 503 路径；或合同降级该 row；
   - **cancellation**：产品级 cancel 契约（非本批 public API）或明确 adapter-level 是否可晋升；
   - **reasoning**：用户提供 reasoning-capable model id 并复跑。
3. `terminal_error` 现为 adapter-real-provider PASS：Governor 需确认是否接受为 Gate C candidate 语义（brief 允许该 transport，但 human promotion 另议）。
4. 禁止在 review 前勾 3.1 或关 Gate C。
