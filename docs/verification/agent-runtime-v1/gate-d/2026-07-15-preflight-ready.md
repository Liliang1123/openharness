# Agent Runtime Gate D Production Executor `preflight_ready` Evidence

Date: 2026-07-15 (Asia/Shanghai)

Status: `preflight_ready`

## Scope And Authorization Boundary

This packet verifies the production executor implementation and deterministic local probes only.

- No Gate D start approval artifact was created.
- `qualification:gate-d-run` was not invoked.
- No 24-hour run, production promotion, or production evidence PASS occurred.
- No real Provider, API-key, OAuth, Codex CLI, or paid model qualification call occurred. Java model endpoints were exercised only with reviewed deterministic mock fixtures and `rawProvider=mock` was required.
- Active OpenSpec tasks 4.2 and 4.3 remain open; the Dashboard remains `proposed`.

Authority:

- [Approved active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)
- [Gate D implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)

## Verified Mechanisms

- Fixed 24-hour duration, 30-second monotonic sample targets, restart offsets at hours 2/12/22, 10,000 exact scoped conversations, concurrency 20, and 60/20/15/5 operation mix cannot be changed by Gate D CLI flags.
- The supervisor spawns a real production Runtime child without shell evaluation, requires PID changes on scheduled restarts, captures redacted output, and never starts or restarts Java Gateway.
- Seed and workload traffic use public Runtime HTTP APIs. Supervisor-side SQLite access is read-only and checks exact seed scope, integrity, event ordering across sample windows, duplicates, dead letters, orphaned approvals, busy exhaustion, and secret canaries.
- Current operation success is bound to the exact request ID and terminal progress; stale session messages cannot satisfy the oracle.
- Every sample checkpoint is appended and fsynced to a mode-`0600` JSONL journal. Preflight, partial, and final artifacts use `wx` and cannot overwrite prior evidence.
- Active workload requests are aborted on stop; child completion waits for stdio close before the journal closes.
- The Runtime child strips inherited API-key, OAuth/auth/access token, cloud access-key, password, secret-key, and credential-path environment entries before the controlled service token is injected.

Primary implementation:

- [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [MockModelService.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java)

## Active Local Probes

| Probe | Observed result |
|---|---|
| Java Gateway on isolated loopback port 18084 | PASS: health, catalog, `gate-d-no-tool`, `tool-time`, `mcp-qualification-echo`, `rawProvider=mock`, and sandbox `get_current_time` |
| Java authentication negative diagnostic | A deliberately mismatched local token was rejected at catalog; using the repository's existing deterministic local authentication contract passed. This was a manual diagnostic rerun, not an automatic qualification retry. |
| Real MCP stdio fixture | PASS: subprocess initialized, catalog exposed `qualification_echo`, shutdown completed, no residual fixture process |
| Process cleanup | PASS: Java port 18084 released; no qualification fixture process remained |

## Verification Results

| Verification | Result |
|---|---|
| Gate D focused Vitest | 5 files, 55/55 PASS |
| Agent Runtime full Vitest | 74 files, 410/410 PASS |
| Agent Runtime typecheck | PASS |
| `ModelControllerTest` | 7/7 PASS |
| Backend full Maven test | 201/201 PASS |
| Root JavaScript/TypeScript tests | shared-schema 60/60, Runtime 410/410, Frontend 24/24, Integration 17/17 PASS |
| Root typecheck | shared-schema, Runtime, Frontend PASS |
| OpenSpec target strict validation | PASS |
| OpenSpec all strict validation | 23/23 PASS |
| Dashboard render/check | 35 entries; generated outputs current |
| Diff whitespace validation | PASS |
| Negative scans | PASS: no configurable Gate D timing/thresholds, shell interpolation, direct SQLite mutation, production custom delay, real Provider route, or literal credential |

## Immutable Source Hashes

The completed [Gate D implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md) SHA-256 is `cf809f4286b82c71b377e26e4d66742dea1bfc895ef1369151b632c1511de3ca`.

| File | SHA-256 |
|---|---|
| [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts) | `5fe4b3a2f7ad476ea8a4f9e5087b9dfd764e9b32c57e2817349b17d2dd91da94` |
| [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts) | `fdd8697a61e47b80e682adc4ed1609612b3db34b3d6b11feea75a50b2347c6c3` |
| [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts) | `dddf2b1af2fdd9e5ae46513d4df7f07bdce2c36e7154fa5e85ea7d28e1854426` |
| [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts) | `818436f51d94e5cad61d0c987a1d2d8c7930a18a8c8aa75e94a5988be1eda719` |
| [MockModelService.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java) | `7bb355e01a7ca026fa15acd94cbf794da39adc25e55d0c06ba9102904e06c392` |
| [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md) | `b7e1d13e9f5226948c31726ae3cc8c2269cf9ff9652f72cf4b2c41d62aa975ae` |

## Verification Command Hashes

| Command purpose | SHA-256 of exact command string |
|---|---|
| Gate D focused Vitest | `4ae2368e5a46264944a4fc4d6c5c20ef415e00d7211185966141eda3012eeb06` |
| Agent Runtime full Vitest | `1da678204487d2226245d47d7f378abb01949ed9c75256a41ab461f78a4ebb02` |
| Agent Runtime typecheck | `27b863f7d2f68c81f717392062f5ffee95a30f78fbc0aae46df991917cc861cf` |
| Focused Backend JUnit | `88864c73080c260590303d487dea5d9038c0e380353ef6e3507957d982da85a2` |
| Backend full Maven test | `efa9b9d2a45ebeb8786281d2bb3f94412e4b0d0b26ad5599494267a7bab17aab` |
| Root tests | `ae7aca4de98e885127fe392c0b60056f3472ed0f0be972870a06df422b3f140a` |
| Root typecheck | `1b65adab2d69e0f148ddd11c15c7dcd73ca087b66cc02dac2672f9493093cc6d` |
| Target OpenSpec strict validation | `40bb0d50204b1b8e475f57858349901152a0fe5cc736507f46f981a43f0fb836` |
| All OpenSpec strict validation | `9e5850898e2c662a80b5ffdcf3130286230cc061cf43a1abe0387aca51355218` |
| Dashboard render | `74d5b86786053bc3907fd435074efb4e11bbe2836b22ebe5dae4e066554bc4e4` |
| Dashboard freshness check | `c0f514df13fadc81382b18be9e245fd8c429a9fef90bdb6e542d307c8f3b5cff` |
| Diff whitespace validation | `466c2f308b48c7661d646fdd068fbecea974c665fe65dbf8ed508f224180ce0b` |

## Remaining Gate

The executor is ready for an exact start packet, but the formal run remains blocked until the user explicitly approves a final run ID, absolute report/partial/journal/preflight paths, the final plan SHA-256, the reviewed credential-free MCP config, and the 24-hour start. A PASS result would still require a separate promotion approval.
