# Batch 02 Implementation Report

## 结论

PASS：Batch 02 已按 Brief 执行 Zhipu / OpenAI-compatible formal production re-run，并落盘真实 production JSON。Gate C 仍不能关闭，因为 production overall 仍为 `blocked`：safe rows 真实通过，retry / terminal_error / cancellation / reasoning 仍按安全边界保持 blocked。

本报告同步目标：
- Worktree: [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)
- Main repo: [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)

## 修改文件

本批未改代码，未改 OpenSpec tasks，未改 Gate 状态。新增产物：

- Primary production evidence: [2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json)
- First failed sandbox attempt: [2026-07-09-zhipu-openai-compatible-production-formal-batch02.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json)
- Report: [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)

## 执行摘要

| 项 | 结果 |
|---|---|
| real provider call | yes, Zhipu / BigModel through backend |
| backend | port `18084`, PID `45716` |
| backend health | `{"status":"UP"}` |
| shutdown | Ctrl-C, Spring graceful shutdown complete |
| primary JSON track | `production` |
| primary JSON result | `blocked` |
| primary JSON rows | 9 |
| Gate C | not closed |
| tasks 3.1 / 3.2 / 3.5 / 3.6 | still `[ ]` |
| code changes in Batch 02 | none |
| commit / archive / push | no |

## Production Evidence

Primary evidence:

[2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json)

Generated at: `2026-07-09T15:36:14.682276Z`

| Row | Result | Evidence |
|---|---|---|
| sync | pass | `httpStatus=200`, `provider=zhipu`, usage `9/4/13`, `costUsdMicros=1` |
| usage-cost | pass | `httpStatus=200`, `provider=zhipu`, usage `12/48/60`, `costUsdMicros=1` |
| stream | pass | `httpStatus=200`, `provider=zhipu`, usage `9/4/13`, `costUsdMicros=1` |
| structured-tool | pass | `httpStatus=200`, tool `lookup`, arguments `{id:1}`, usage `136/9/145`, `costUsdMicros=1` |
| timeout | pass | `errorClass=PROVIDER_TIMEOUT`, `structuredStatus=504`, `timeoutSeen=true` |
| retry | blocked | `requestSent=false`; no safe production 503 injection path |
| terminal_error | blocked | `requestSent=false`; no safe invalid-request/auth mutation path |
| cancellation | blocked | `requestSent=false`; no public production chat cancellation endpoint |
| reasoning | blocked | configured `glm-4-flash` not proven reasoning-capable in this batch |

First attempt note:

- [2026-07-09-zhipu-openai-compatible-production-formal-batch02.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json) is retained as an execution-environment failure record.
- It is not provider evidence: safe rows failed with `ConnectException: Operation not permitted`.
- Root cause: harness process ran inside sandbox and could not connect to local backend; backend logs showed no `/api/v1/model/chat` calls for that attempt.
- Corrective action: reran harness outside sandbox with a new filename, preserving the failed artifact instead of overwriting evidence.

## Commands And Results

Preflight:

| Command | Result |
|---|---|
| `git status --short` | completed; worktree had known batch-preexisting dirty changes |
| `git diff --cached --name-only` | exit 0, no output; no staged changes |
| `.env` existence + provider API key non-empty check | exit 0, no secret output |
| `lsof -nP -iTCP:18084 -sTCP:LISTEN` | exit 1, no listener before start |

Backend:

| Command | Result |
|---|---|
| backend start with `.env` sourced and `SERVER_PORT=18084` | started successfully, PID `45716` |
| `curl -fsS http://127.0.0.1:18084/actuator/health` | exit 0, `{"status":"UP"}` |
| shutdown | Ctrl-C, graceful shutdown complete |
| `ps -p 45716` | exit 1 after shutdown |
| `lsof -nP -iTCP:18084 -sTCP:LISTEN` | exit 1 after shutdown |

Harness:

| Command | Result |
|---|---|
| first sandbox run to `...batch02.json` | command exit 0 but JSON `result=fail`; not accepted as provider evidence |
| non-sandbox rerun to `...batch02-rerun01.json` | command exit 0; JSON `result=blocked` with safe rows pass |
| JSON shape / blocked-row assertion with `export REPORT` | exit 0; `{track:"production", result:"blocked", rowCount:9}` |

Step critical:

| Command | Result |
|---|---|
| `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test` | exit 0; 12 tests, 0 failures |
| `pnpm --filter @openharness/shared-schema test -- schema` | exit 0; 49 tests passed |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | exit 0; change valid; PostHog telemetry DNS noise only |
| `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | exit 0; change valid; PostHog telemetry DNS noise only |
| `git diff --check` | exit 0; no output |

Secret scan:

Scan targets before report creation:

- [2026-07-09-zhipu-openai-compatible-production-formal-batch02.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json)
- [2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json)

Canaries: provider key environment names, raw authorization-token values, OpenAI-style secret prefixes, and dotted BigModel key shape.

Result before report creation: exit 1, no matches. Final scan including this report: exit 1, no matches.

## Worktree Status

Initial status summary:

- Existing batch-preexisting modified/untracked files were present before Batch 02.
- No staged changes were present.
- Batch 02 added provider JSON evidence and this report only.

Final status is expected to include:

- [2026-07-09-zhipu-openai-compatible-production-formal-batch02.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02.json)
- [2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production-formal-batch02-rerun01.json)
- [02-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/02-report.md)

`git diff --stat` currently reflects preexisting tracked edits from earlier batches; it does not include untracked Batch 02 evidence files. No code was changed in Batch 02.

## Boundary Confirmation

- Did not check [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) items 3.1 / 3.2 / 3.5 / 3.6.
- Did not close Gate C.
- Did not run Gate B / Gate D / archive / freeze.
- Did not implement OAuth.
- Did not treat Anthropic as Gate C required.
- Did not run unsafe real error injection.
- Did not commit, push, reset, clean, or stage files.
- Did not print, copy, or persist provider secrets.

## Next Step

Send this report and the primary production JSON to Grok/Governor for Batch 02 implementation review. Do not start Batch 03 until that review is written.
