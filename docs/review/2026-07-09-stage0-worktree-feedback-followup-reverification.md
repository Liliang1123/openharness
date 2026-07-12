# Stage 0 Worktree Feedback Follow-up — Reverification Review

## 结论

有风险。

Codex 对 [上一轮 independent review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-stage0-worktree-task-checkbox-and-gate-boundary-review.md) 中 **可代码/文档收口的 Important 项已实质闭合**：未标记 custom delay 不再产出 production/pass；压缩仿真强制 `track=local` + `result=local_verified`（成功路径）与 `evidenceKind=compressed-test-simulation`；runbook 已拆分 Gate D start / promotion；preflight 自证边界与 GateDApproval 仅为 runtime guard 已写入；stage1-gate-b 陈旧「local tests still open」文案已改为 production evidence blocker。

**不构成需回滚五个 checkbox 的缺陷。** 仍保留 **有风险** 口径的原因是：

1. Stage 0 / Gate B/C/D / freeze / archive **本就未完成**（正确 pending）。
2. 压缩报告存在 **Medium 残留**：`report.track=local` 时 `environment.track` 仍可能继承配置里的 `"production"`，自动化证据扫描若只看 environment 会误判。
3. 全量测试/OpenSpec 等以 Codex 记录为主；本轮独立复跑了 focused formalSoakRunner（5/5 pass），未重跑 24h 真实 soak（也不应跑）。

## 文档类型 / 日志及版本

- 文档类型：Follow-up Code/Diff Review
- 日期：2026-07-09
- 会话标识：stage0-worktree-feedback-followup-reverification
- 结论：`有风险`
- 对照输入：[stage0-worktree-review-feedback-followup.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-stage0-worktree-review-feedback-followup.md)

## Review 范围

- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts)
- [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/formalSoakRunner.test.ts)
- [agent-runtime-v1-production-runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md)
- [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- 上一轮边界 review 与 Codex follow-up 文档

边界遵守：未跑真实 Provider matrix；未启正式 24h soak；未 archive；未做 OpenClacky parity 实现。

## 对上一轮 findings 的闭合核对

| 编号 | 上一轮问题 | Follow-up 处置 | 本轮判定 |
| --- | --- | --- | --- |
| I-1 | no-op delay 可产出 production/pass | `delayMs` 且无 `compressedTestRun` → throw；压缩成功路径 `track=local` / `result=local_verified` / `evidenceKind=compressed-test-simulation`；测试覆盖 reject + local 路径 | **Pass（已闭合）** |
| I-2 | preflight 调用方自证 | runbook + task13 明确 operator-attested，非自动探测 | **Pass（文档闭合）** |
| I-3 | Gate D start 与 promotion 捆在一格 | 表拆为 `Gate D start` / `Gate D promotion`；正文保留通过后仍要 promotion approval | **Pass（已闭合）** |
| I-4 | 2.5 不可当 Gate B | 2.6/2.7 仍 pending；gate-b 文案指向 production evidence | **Pass（边界保持）** |
| I-5 | 不可宣称 Stage 0 完成 | follow-up 与 tasks 仍禁 4.2/4.3/5.x | **Pass** |
| M-2 | GateDApproval 可代码构造 | runbook 写明仅为 runtime guard，真批准看 audit 记录 | **Pass（文档闭合）** |
| M-3 | stage1-gate-b 段首陈旧 | Task 3/5/6/7 status 已改写，不再暗示 local tests 未齐 | **Pass** |
| M-1 | production track 易混淆 | 压缩报告顶层 track 已降为 local；见下方残留 | **部分闭合** |

## 代码行为抽查

### formalSoakRunner

关键逻辑（已读源码）：

```ts
if (input.delayMs && input.compressedTestRun !== true) {
  throw new Error("custom delay requires compressed test simulation marker...");
}
const reportTrack = input.compressedTestRun === true ? "local" : "production";
const evidenceKind = input.compressedTestRun === true
  ? "compressed-test-simulation"
  : "formal-24-hour-soak";
```

- 未标记 custom delay：**禁止启动** — 与 I-1 要求一致。
- 压缩仿真成功：`createRuntimeBaselineReport` 在 `track=local` 时结果为 `local_verified`（见 [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/localBaseline.ts)）。
- 压缩仿真资源增长失败：`result=fail` 且仍带 `evidenceKind=compressed-test-simulation` — 合理。
- 真实路径默认 `delay = sleep`，无 `compressedTestRun` 时 `evidenceKind=formal-24-hour-soak`、`track=production` — 方向正确。

测试（`formalSoakRunner.test.ts`）：

- 未标记 `delayMs` → rejects。
- `compressedTestRun: true` → `track=local` / `local_verified` / evidenceKind。
- 资源增长超限 → `fail` + compressed evidenceKind。

本轮复跑：

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
# 5/5 passed
```

### Runbook

- Operator Gates 表：`Gate D start` 与 `Gate D promotion` 分行。
- Preflight：operator-attested checklist。
- Compressed simulations 不得作 Gate D production evidence。
- GateDApproval 仅为 runtime guard。

### stage1-gate-b

段首 Status 已统一为：**local 实现通过；Gate B 仍因 production migration/RPO/RTO 证据缺失而 pending**。不再误导「local recovery tests 仍 open」。

### tasks 勾选

- **16 checked / 14 unchecked**（16/30）— 与用户声称一致。
- 仍仅 local/docs 相关完成；**2.6、2.7、3.1、3.2、4.2、4.3、4.5、4.6、5.x 均未勾选** — 未越权。

## 主要发现

### Critical

无。

### Important

无新增阻塞项。上一轮 I-1～I-5 在代码/文档层已收口。

### Medium

#### M-1（残留）：压缩报告 `environment.track` 可能与 `report.track` 不一致

`createFixedTwentyFourHourSoakConfig` 写入 `environment.track: "production"`。`runFixedTwentyFourHourSoak` 在压缩路径只改 `createRuntimeBaselineReport({ track: "local", ... })`，但对 environment 做：

```ts
environment: {
  ...input.environment, // 仍含 track: "production"
  evidenceKind,
  ...
}
```

因此压缩报告可能出现：

| 字段 | 值 |
| --- | --- |
| `report.track` | `local` |
| `report.result` | `local_verified`（成功时） |
| `report.environment.evidenceKind` | `compressed-test-simulation` |
| `report.environment.track` | 仍为 `production`（继承） |

**风险：** 弱扫描若只读 `environment.track` 可能误标 production。顶层 track/result/evidenceKind 已足以人工区分，但建议 follow-up 小补丁：压缩路径显式 `environment.track = "local"`（及可选 `wallClockVerified: false`）。

**不要求**回滚 checkbox；**建议**在合入前或下一轮 docs/code 微调。

#### M-2（已知、可接受）：真实 production 路径无自动化 24h 测试

unit 测试不会也不应跑真实 24h sleep。Gate D 仍依赖人工批准 + 真实 wall-clock 运行。边界文档已写清。

#### M-3（流程）：worktree 未 merge；主工作区另有脏改动

- Stage 0 变更仍在 [worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout)，未 commit/merge。
- 主工作区可见 `.gitignore`（`/.worktrees/`）及与 baseline 相关的其他修改；**本 review 不把主仓 baseline 脏改动计入 Stage 0 通过证据**。合入 Stage 0 时应只带 worktree 意图文件，避免捎带无关 diff。

## Gate B / C / D 剩余状态

| Gate | 状态 |
| --- | --- |
| **Gate B** | **仍打开**（2.6/2.7；缺 production 证据包） |
| **Gate C** | **仍打开**（3.1/3.2） |
| **Gate D** | **仍打开**（4.2/4.3；仅 preflight/harness） |
| freeze / archive / parity 1–9 | **禁止** |

## 验证记录

本轮独立执行：

```bash
cd /Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
# Tests 5 passed
```

采信 Codex 已记录且未与源码矛盾的结果（未在本轮重跑全量，以节省时间且边界允许）：

- Agent Runtime full tests 311
- 全仓 test / typecheck
- Backend Maven 45
- OpenSpec strict 23/23（PostHog DNS warning 非阻塞）
- dashboard check
- git diff --check
- 83 file:/// 链接检查

若合入主线前需再签一次 full suite，应在 **worktree 干净意图集** 上重跑，而非混入主仓无关脏文件。

## 最终建议

1. **接受** follow-up 对 I-1/I-2/I-3/M-2/M-3 的收口；**保留** 2.1/2.3/2.4/2.5/4.4 勾选。
2. **建议小补丁（非阻塞）**：压缩路径强制 `environment.track="local"`，避免与 `report.track` 分叉。
3. **不得**勾选 2.6/2.7/3.1/3.2/4.2/4.3/4.5/4.6/5.x；**不得** archive；**不得**开 OpenClacky parity 实现。
4. 下一步仍是 **Gate B 生产证据**，或经显式批准的 Gate C / Gate D start。
5. 合入时确认仅携带 Stage 0 worktree 意图变更 + 主仓 `.gitignore` worktrees 忽略（若需要），剥离无关 baseline 脏改动。

## 后续门禁

| 项 | 结论 |
| --- | --- |
| Follow-up 是否闭合上一轮可修风险 | **是（I 级）；M-1 残留建议再补** |
| 是否可宣称 Stage 0 完成 | **否** |
| 是否可关闭 Gate D | **否** |
| 是否修改项目规则 | **否** |
| 是否 commit/merge/archive | **否**（用户已声明；本 review 亦不授权） |

## 摘要

- Codex follow-up **有效**，上一轮核心误报 production/pass 与 Gate D 表混淆问题已修。
- 五个 local/docs checkbox **仍可保留**。
- **有风险** 仅因 Stage 0 大门未关 + 压缩报告 environment.track 残留不一致 + 未 merge 的工作区边界，**不是** follow-up 失败。
