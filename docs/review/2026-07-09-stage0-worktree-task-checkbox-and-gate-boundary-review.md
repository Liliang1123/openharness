# Stage 0 Worktree Diff — Task Checkbox And Gate Boundary Review

## 结论

有风险。

在 [Stage 0 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout) 内，将 OpenSpec tasks **2.1、2.3、2.4、2.5、4.4** 勾选为完成，**就「本地实现 + local_verified 测试/文档证据」而言基本成立**；**未发现** formal soak preflight 勾选关闭 Gate D / 4.2 / 4.3，也**未发现** production runbook 单独授权 production promotion。

但存在若干 **Important** 边界风险：preflight 是调用方自证布尔量、formal runner 可用 no-op delay 瞬间产出 `track: "production"` 且 `result: "pass"` 的报告、Gate D「start」与「promotion」在 runbook 表格中措辞略糊。这些不要求回滚五个 checkbox，但**禁止**把本 worktree 表述为 Stage 0 完成、Gate B/C/D 关闭或可 archive。

## 文档类型 / 日志及版本

- 文档类型：Code / Diff / Task-status Review
- 日期：2026-07-09
- 会话标识：stage0-worktree-task-checkbox-and-gate-boundary-review
- 结论：`有风险`
- 审查边界（已遵守）：
  - 未运行真实 Provider credential matrix
  - 未启动正式 24h soak
  - 未 archive active change
  - 未开始 OpenClacky parity Stage 1–9 实现

## Review 范围

### Worktree 与 diff

- Worktree 根：[.worktrees/stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout)
- 分支：`stage0-runtime-production-closeout`（base `9b3b404`）
- 本轮相对 base 的变更：
  - 修改：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)（勾选 2.1、2.3、2.4、2.5、4.4）
  - 新增：[formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts)
  - 新增：[formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/formalSoakRunner.test.ts)
  - 新增：[agent-runtime-v1-production-runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md)
  - 新增若干 verification / review 文档

### 必读与对照

- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [2026-07-09-stage0-local-evidence-task-status-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-stage0-local-evidence-task-status-review.md)
- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts)
- [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/formalSoakRunner.test.ts)
- [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)
- [agent-runtime-v1-production-runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md)
- [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- 既有 storage / test 实现目录：`agent-runtime/src/storage`、`agent-runtime/test`

## 勾选任务逐项判定

| Task | 勾选 | 判定 | 依据摘要 |
| --- | --- | --- | --- |
| **2.1** SQLite boundary / UoW / migration / readiness / busy retry / WAL / low-disk | `[x]` | **Pass（local）** | [`runtimeStorage.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/runtimeStorage.ts)、[`singletonLock.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/singletonLock.ts)、[`diskGuard.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/diskGuard.ts)、[`lifecycleCommands.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/lifecycleCommands.ts) + 对应 tests + stage1-gate-b Task 3–5 |
| **2.3** JSON import / quarantine / backup hash / forward-only | `[x]` | **Pass（local）** | [`jsonImporter.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/jsonImporter.ts)、`jsonImporter.test.ts`、task8 rehearsal、stage1-gate-b Task 8。**不等于** Gate B production bundle |
| **2.4** startup reconcile → `EXECUTION_INTERRUPTED` / invalidate approvals / no runner rebuild | `[x]` | **Pass（local）** | [`reconcile.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/reconcile.ts)、`restartReconciliation.test.ts`、`approvalRecovery.test.ts`、stage1-gate-b Task 6 |
| **2.5** crash matrix / fencing / provisional / cursor / IDOR / WAL / low-disk / migration / outbox / restart tests | `[x]` | **Pass with boundary（local）** | 能力分散在 `crashMatrix`、`lifecycleUnitOfWork`、`singletonLock`、`traceOutbox`、`sessionEventsApi`、`sqliteRuntimeEventStore`、`diskGuard`、`storageDriverSpike`、`runtimeStorage`、IDOR 相关 API tests 等；**是本地测试面，不是 2.6/2.7 production evidence** |
| **4.4** Document backup/restore/migration/recovery/qualification/private-service procedures | `[x]` | **Pass（docs）** | 新增 [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md) 覆盖要求主题；**文档交付 ≠ 执行证据** |

### 未过度勾选（相对本 diff）

下列关键任务在 tasks.md 中**仍为 pending**，与证据边界一致：

- **2.6 / 2.7** — Gate B production evidence
- **3.1 / 3.2** — real Provider matrix
- **3.5 / 3.6** — Stage 2 strict gate
- **4.2 / 4.3** — formal 24h soak 与结果验收
- **4.5 / 4.6** — full gates + contract freeze
- **5.1–5.4** — closeout / verified / archive

本轮 **没有** 因 preflight harness 勾选 4.2 或 4.3。

## 主要发现

### Critical

**未发现 Critical 阻塞项**（在「五个 checkbox 仅代表 local 实现/文档，且 Gate B/C/D 仍开」的前提下）。

### Important

#### I-1：formal soak preflight **未**关闭 Gate D（合格），但 **可被误读为已跑通 production soak**

证据：

- [`assertFixedTwentyFourHourSoakStartAllowed`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts) 在缺 approval / preflight / blocked preflight 时拒绝启动 — **正确加强启动门闩**。
- 文档明确 `preflight_ready`、不关闭 Gate D、不勾选 4.2/4.3 — **正确**。
- 单元测试使用 `delayMs: async () => undefined` 可在毫秒级“跑完”固定 24h 采样循环，并得到 `report.track === "production"` 且 `report.result === "pass"`（本轮 focused 测试已复现通过）。

风险：若有人把单测生成的 production-track pass report 误存为 Gate D 证据包，会**虚假关闭** 4.2/4.3。

要求：

- 真实 Gate D 报告必须含：真实 wall-clock 时长、人工 approval 记录、非 no-op delay、真实采样源、固定 report path 与阈值审计。
- 单测 / 本地 harness 产物必须标注 `harness_only` / `local_verified`，禁止改名 `production_verified`。

#### I-2：Preflight 是 **调用方自证**，不是自动探测

`evaluateFixedTwentyFourHourSoakPreflight` 仅检查传入的 `javaGatewayRunning`、`deterministicFixturesReady`、`diskHeadroomBytes` 等布尔/数值；**不**连接 Java、不扫盘、不读真实 monitoring。

含义：

- 作为「启动前配置校验 DSL」合理。
- **不能**单独证明 preflight 在真实环境已满足。
- 真实 Gate D 启动前仍需 operator 用可审计探测填充这些字段（或后续 CLI 接线真实探针）。

当前 worktree **没有** 把该 runner 接到生产 CLI 入口；仅 library + unit tests。这进一步说明它只是 preflight **能力**，不是 Gate D **完成**。

#### I-3：Runbook **未**误授权 promotion（合格），Gate D 表格措辞略糊

[runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md) 文首与多处写明：不批准 cutover、real Provider、formal soak。

合格点：

- Gate B/C/D 分列证据包。
- Soak 失败不得 promote；通过后仍需 **explicit human promotion approval**。
- Closeout 要求 B+C+D+full gates+freeze。

轻微问题：

- Operator Gates 表中 Gate D 一行写「formal 24-hour soak **start and promotion**」，把 **start** 与 **promotion** 捆在同一格，易被读成“开 soak 即 promotion”。正文后段已拆开，建议表格改为两行或两阶段（start approval vs promotion approval）。

**不构成 4.4 需回滚**，但建议 docs 勘误。

#### I-4：2.5 勾选可接受，但须坚持「local tests 全集」而非「production Gate B 完成」

2.5 文本是 **Add ... tests**，不是 2.6/2.7 的 production evidence。本地测试面覆盖：

| 2.5 子项 | 代表性证据 |
| --- | --- |
| UoW crash matrix | `crashMatrix.test.ts`、`lifecycleUnitOfWork.test.ts` |
| second-instance fencing | `singletonLock.test.ts` |
| provisional-context recovery | crashMatrix + restartReconciliation |
| cursor watermark / replay-live | `sqliteRuntimeEventStore.test.ts`、`sessionEventsApi.test.ts`（含 `stream_resync_required`） |
| IDOR / cross-user | `approvalApi`、`sessionEventsApi`、`memoryApi`、`sessionsApi` |
| lock contention / BUSY | `storageDriverSpike.test.ts`（BEGIN IMMEDIATE） |
| WAL | runtimeStorage / storageDriverSpike |
| low-disk | `diskGuard.test.ts` |
| migration | `runtimeStorage.test.ts` |
| outbox crash-before/after-ack / dead-letter | `traceOutbox.test.ts` |
| restart | `restartReconciliation.test.ts` |

**边界：** stage1-gate-b 全文仍反复写 “Gate B remains pending”；fixture import ≠ production RPO/RTO。勾选 2.5 **同时** 保持 2.6/2.7 打开 — **正确**。若有人把 2.5 解释为 Gate B 关闭，则越权。

#### I-5：stage0-local-evidence review 总判断可用，但不能替代独立 Gate 关闭

[stage0-local-evidence-task-status-review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-stage0-local-evidence-task-status-review.md) 结论为「有风险」、明确 Gate B/C/D 未关 — 与本 review 一致。其「2.1/2.3/2.4/2.5/4.4 可勾选」在 local 口径下 **通过**。

### Medium

#### M-1：`track: "production"` 用于 formal harness 配置

固定 soak config 强制 `track: "production"`。对正式 Gate D 合理；对 unit test 合成报告则易混淆。建议在 report environment 强制写入 `baselineKind: "fixed-24-hour-soak"`（已有）并额外要求真实运行写入 `wallClockVerified: true` 或禁止 no-op delay 的 report 进入 evidence 目录。

#### M-2：Gate D approval 对象可在代码中任意构造

`GateDApproval` 仅为 `{ approved: true, approvedBy, approvedAt, reason }`，无签名/外部审批系统绑定。作为进程内门闩够用；**真实 Gate D 仍依赖人工流程与审计日志**，不能把「对象字段为 true」当合规批准。

#### M-3：stage1-gate-b 早期 Task 小节 status 文案陈旧

部分 Task 3–7 段首仍写 “later Stage 1 … still open”，而后续 Task 8 已完成 local import。不影响 checkbox 判定，但会造成读者以为 2.5 测试面未齐。建议后续 docs-only 刷新段首 status（非本轮阻塞）。

#### M-4：本 worktree 未 merge 到主工作区

主仓 [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 仍显示 2.1/2.3/2.4/2.5/4.4 未勾选。审查结论仅针对 **worktree diff**；合入主线前仍需同样门禁。

## Gate B / C / D 剩余状态

| Gate | 状态 | 说明 |
| --- | --- | --- |
| **Gate B** | **仍打开** | 2.6/2.7 未勾选；缺 production backup/import/quarantine/restore、measured RPO/RTO；task8 仅为 fixture-level |
| **Gate C** | **仍打开** | 3.1/3.2 未勾选；本轮边界禁止真实 Provider；3.0/3.3/3.4 仅为 local_verified |
| **Gate D** | **仍打开** | 4.2/4.3 未勾选；仅有 preflight harness + unit tests；无正式 24h 报告；无 promotion approval |
| Runtime v1 freeze / archive | **禁止** | 4.5/4.6/5.x 未完成；dashboard 仍应为 active `proposed` 直至 verified 证据齐备 |

## 验证命令与本轮观察

```bash
# worktree 状态
cd /Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout
git status -sb
git diff -- openspec/changes/harden-agent-runtime-single-node-production/tasks.md

# focused formal soak harness tests only（非真实 24h）
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
```

本轮实际观察：

- `tasks.md` diff 仅将 2.1、2.3、2.4、2.5、4.4 从 `[ ]` 改为 `[x]`。
- `formalSoakRunner`：**5/5 tests passed**（约 120ms；确认 no-op delay 可合成完整 schedule）。
- 未运行：真实 Provider matrix、正式 24h soak、archive、OpenClacky parity。
- 未重新跑全量 311 tests / Maven / dashboard（依赖 worktree 内既有 review 记录；本审查以源码+任务边界为主）。

建议合入前补跑（仍不启动 24h / 真实 Provider）：

```bash
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
mvn -f backend/pom.xml test
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
pnpm dashboard:check
git diff --check
```

## 最终建议

1. **保留** worktree 对 **2.1、2.3、2.4、2.5、4.4** 的勾选，前提是对外口径严格为 **local implementation / local_verified docs**，不是 production qualification。
2. **禁止**勾选或暗示关闭 2.6、2.7、3.1、3.2、4.2、4.3、4.5、4.6、5.x。
3. formalSoakRunner：**保留**为 Gate D 启动前 harness；真实 soak 仅在人工 Gate D start approval 后执行；合成 pass report 不得进入 production evidence。
4. runbook：建议微调 Gate D 表行，区分 start approval 与 promotion approval（docs-only）。
5. 下一步仍是 **Gate B production evidence** 或（在授权后）**Gate C / Gate D**，**不是** OpenClacky parity Stage 1–9，**不是** archive。

## 后续门禁

| 项 | 结论 |
| --- | --- |
| 五个 checkbox 是否需回滚 | **否**（在 local 口径下） |
| Gate D 是否被 preflight 关闭 | **否** |
| Runbook 是否授权 promotion | **否** |
| 是否可 archive active change | **否** |
| 是否可宣称 Stage 0 完成 | **否** |
| 是否可开 OpenClacky parity 实现 | **否** |
| 是否修改项目规则 | **否**（本 review） |
| 是否运行真实 Provider / 24h soak | **否**（遵守边界） |

## 摘要

- **勾选 2.1/2.3/2.4/2.5/4.4：** 有本地实现与测试/文档支撑，**不过度**到 Gate B/C/D。
- **formal soak preflight：** 加强启动门闩，**不**关闭 Gate D；需警惕 production-track 合成 pass report。
- **runbook：** 满足 4.4 文档交付，**不**单独授权 promotion。
- **剩余硬门：** Gate B、Gate C、Gate D、full gates、freeze、closeout/archive 全开。
