# Agent Runtime 24h Local Soak Closeout Review

## 结论

需修改：报告可以认定为完成了 24 小时 **本地 database/sampler baseline**，结果保持 `local_verified`；但证据不足以把 Task 4.2 标记为“本地完成”或“人工验收通过”。它不能关闭生产 Gate D，也不能据此进入 Runtime v1 freeze、dashboard `verified` 或 OpenSpec archive。

本次用户确认授权继续推进并明确接受“未生产闭环”的边界，不等同于计划要求的 **结果后显式 human promotion approval**。更关键的是，报告对应的本地执行形状只 seed completed rows、顺序采集数据库读延迟并 close/reopen SQLite connection；报告内的 concurrency/mix 是 workload metadata，不是 20 concurrent Runtime executions、工具/审批执行和 TS Runtime process restart 的观察证据。即使补充人工批准，也不能把当前报告转换为 Task 4.2 或 production qualification。

## Review 范围

- 正式报告只读来源：[主工作区报告](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-formal-24h-soak.json)
- 隔离 worktree 内的同内容证据：[24h local soak report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/baseline/2026-07-09-formal-24h-soak.json)
- Gate D runner：[formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- Runner tests：[formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)
- 本地 database/sampler 执行路径：[localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- 本地 sampler runner：[localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- OpenSpec proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- 实施计划：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- Preflight review：[2026-07-09-task13-formal-soak-preflight-harness-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-task13-formal-soak-preflight-harness-review.md)
- Dashboard 数据源：[development-log.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Pass — 证据文件完整性与内部一致性

- 只读来源与隔离 worktree 目标文件的 SHA-256 均为 `ccabbc282095f35202374be2e9e98093bf48d85cb60c987eb7213d2eeb581fc8`。
- 报告内 canonical `reportHash` 记录值与重新计算值均为 `ef307ad1c5e8171b779ca8994c6e64d551efde7241d8bf9b61bdcfbbbfb76879`。
- JSON 语法、字段形状和 track/result refinement 经独立语义脚本核对；当前 shared-schema 相关测试 `49/49` 通过。报告无 `failures`，所有 sample 的 `hardFailures` 总数为 `0`。

### Pass — 24h local database/sampler baseline 已完成

- `generatedAt=2026-07-09T08:58:17.980Z`，最后样本为 `2026-07-10T08:58:17.980Z`，时间差 `86,400,000ms`。
- 样本数 `2,880 / 2,880`，采样间隔 `30,000ms`。
- workload metadata 为 `10,000` seeded conversations、`20` concurrency；操作清单分布为 no-tool `6,000`、Java sandbox `2,000`、MCP `1,500`、approval/interruption `500`。该段仅描述配置/清单，不声称这些操作被 Runtime 执行。
- 报告记录的 reopen observations 为 `7,200,000ms`、`43,200,000ms`、`79,200,000ms`，对应 2h / 12h / 22h。
- 最大值均低于固定阈值：admission p95 `6.8145ms < 100ms`、durable replay p95 `0.4110ms < 250ms`、RSS `180,830,208 < 1,610,612,736 bytes`、FD `29 < 1,024`、WAL `6,550,832 < 268,435,456 bytes`、MCP child `0 < 2`。
- 首尾各 2 小时 median：RSS 从 `60,497,920` 降至 `56,844,288 bytes`，增长率 `-6.04%`；FD 为 `29 -> 29`，增长率 `0%`。

### Blocker — 报告不证明 Task 4.2 workload 与 TS restart

- [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localShortBaselineExecution.ts) 的匹配执行路径将 operation 清单直接 seed 为 completed conversation/message/execution/event rows；采样循环每轮执行顺序 `COUNT(*)` read probes，没有启动 20 个并发 Runtime execution。
- `concurrency=20` 和 `60/20/15/5` 位于 report workload metadata；它们不构成 Java sandbox、MCP、approval/interruption 实际执行证据。报告全程 `mcpChildCount=0` 也不能支持 MCP workload 已执行的推断。
- 匹配本地 restart callback 只关闭并重开 SQLite database handle，不重启 TS Runtime process。因此报告中的 2h/12h/22h event 不能满足 Task 4.2 的 “TS-only restarts”。
- 报告没有记录生成命令/provenance，不能把与本地路径一致的 JSON 反向提升为 formal runner evidence。

### Blocker — 当前报告不是 production Gate D evidence

- 报告自述 `track=local`、`result=local_verified`、`environment.track=local`、`baselineKind=fixed-24-hour-local-soak`。
- 正式 runner 的非压缩路径应输出 production track，并写入 `evidenceKind=formal-24-hour-soak`、脱敏 Gate D start approval 和 preflight。当前报告没有这些字段。
- OpenSpec design 明确规定 `local_verified` 不得标记 Gate B/C/D 通过、dashboard `verified`、OpenSpec complete 或 archive。
- 因此本次只新增已勾选的 `4.0a` 本地 database/sampler supporting 子项；原始 `4.2/4.3` 保持未勾选。

### Blocker — 结果后人工 promotion approval 尚未满足

- 实施计划规定 Gate D “manual before start and manual promotion after result”。当前消息的确认语义是授权继续工作并确认“本地完成、未生产闭环”，不是对 production promotion 的显式批准。
- Resume condition：先产生可审计的 production-track formal report（包含 runner start approval/preflight/evidence kind），独立 review 通过后，再由授权人明确批准 Gate D promotion。

### Risk — 报告结论受采样输入边界限制

报告能证明本地 seeded database/sampler 的 hard-failure observations 为零并通过 schema/oracle，但不能仅凭 JSON 推断并发 Runtime workload、工具/审批副作用、TS process reconciliation、生产服务、生产数据、真实 Provider credential、生产 backup/restore 或生产部署已经闭环。Gate B、Gate C required rows、Task 4.2/4.3/4.5/4.6 均继续独立门禁。

## 验证记录

- 报告一致性脚本：PASS；源/目标 SHA-256 一致、canonical `reportHash` 一致、样本/时间/负载/重启/阈值/median growth 语义一致。
- `pnpm --filter @openharness/agent-runtime test -- localShortBaselineExecution.test.ts formalSoakRunner.test.ts`：PASS，`6/6` tests（local execution `1` + formal runner `5`）。
- `pnpm --filter @openharness/shared-schema test -- schema.test.ts`：PASS，`49/49` tests。
- `pnpm --filter @openharness/agent-runtime typecheck`：PASS。
- `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS；仅有 OpenSpec telemetry 访问 `edge.openspec.dev` 失败的非阻塞网络 warning。
- `pnpm dashboard:check`：PASS，生成产物 current。
- `git diff --check`：PASS。
- 一个附加的 `tsx -e` 实例解析尝试因 workspace package 的 ESM-only conditional exports 与临时执行入口解析限制失败；未修改代码，也未用于正向结论。正式结论由 canonical 语义检查、schema suite、runner suite、typecheck 与 strict validations 共同支撑。

## 最终建议

1. 将当前报告作为 Task 4.0a 的 24 小时本地 database/sampler supporting evidence 保存并引用，不把 Task 4.2 标记为本地完成，不改名为 production/formal PASS，不手工改写 `track/result/environment`。
2. Gate D 保持 `BLOCKED`。按 formal runner 原生 24 小时路径执行真实并发 Runtime workload 与 TS-only restarts；如希望降低或替换这些验收条件，必须先修改并重新批准 OpenSpec 的 qualification contract，不能用一次审批绕过现行语义。
3. 优先闭合 Gate B 生产迁移证据和 Gate C required OpenAI-compatible rows；随后执行 production-track Gate D、结果后人工 promotion、全仓 production qualification 与 contract freeze。

## 后续门禁

- OpenSpec proposal：当前 change 保持 active；本轮不需要新 change。若要把 local soak 改成 production Gate D 的替代证据，则必须先修订现有 OpenSpec 并重新审批。
- Superpowers plan：现有计划继续有效；已补充 local supporting evidence，正式 Task 13 checklist 保持未完成。
- 测试/校验：需要报告 schema/hash/语义检查、formal runner tests、OpenSpec strict、dashboard render/check、`git diff --check`。
- 人工审批：仍需要 production-track Gate D 报告 review 通过后的显式 human promotion approval。
- 归档：禁止；Gate B、Gate C required、Gate D、Task 4.5/4.6 和 closeout 尚未完成。
