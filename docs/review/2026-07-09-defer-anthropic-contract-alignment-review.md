# Defer Anthropic From Gate C — 合同对齐复核

## 结论

**通过**：`defer-anthropic-from-gate-c` 合同对齐已正确落地到全部 8 个目标文件及 worktree 同步副本。Gate C 必选族已从 OpenAI-compatible + Anthropic 收窄为仅 OpenAI-compatible；Anthropic 真实矩阵标记为 deferred / post-Gate-C；Gate C 仍未关闭（OpenAI-compatible 真实矩阵 required rows 尚未全部 PASS）。存在 1 项非阻塞观察。

## Review 范围

### defer-anthropic-from-gate-c 制品

| 文件 | 审查重点 |
|---|---|
| [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/proposal.md) | 产品决策与变更范围 |
| [design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/design.md) | Gate C PASS/NOT-REQUIRE 语义表 |
| [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/tasks.md) | 任务完成状态 |
| [specs/provider-adapter/spec.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/specs/provider-adapter/spec.md) | spec delta 场景契约 |

### harden-agent-runtime-single-node-production 被对齐制品

| 文件 | 审查重点 |
|---|---|
| [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md) | L26-27 deferred 声明 |
| [design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md) | L5 deferred 声明 + L89-91 matrix 口径 |
| [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) | 3.2 deferred 文案 + 3.1 Gate C required |
| [specs/provider-adapter/spec.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md) | L4 Anthropic deferred 场景 |

### Stage 0 plan + dashboard + alignment review

| 文件 | 审查重点 |
|---|---|
| [Stage 0 plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md) | Gate C 表 L28 + Task 10 L392-409 |
| [development-log.json](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json) | `defer-anthropic-from-gate-c` status=partial + `harden` notes |
| [alignment review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-defer-anthropic-from-gate-c-approval-alignment-review.md) | 前序 review 结论 |

## 主要发现

### ✅ defer-anthropic-from-gate-c 制品——完整且语义一致

- **Proposal** (L9)：明确引用 "用户决策 2026-07-09 拍板"，decision 为 "Anthropic real-provider matrix is deferred / post-Gate-C"。
- **Design** (L14-22)：Decision table 6 行全覆盖——Gate C required = OpenAI-compatible only、missing Anthropic credential MUST NOT block Gate C、OpenAI-compatible row fail 仍 vetoes、promotion label 仅在 deferred real matrix pass 后。
- **Design** (L43-53)：Gate C PASS/NOT-REQUIRE 伪代码，显式列出 "Gate C does NOT require: Anthropic real matrix PASS / Anthropic credentials present"。
- **Spec delta** (L3-4)：`SHALL require` OpenAI-compatible, `MUST NOT require` Anthropic。4 个 Scenario 覆盖了 happy path / veto / mock forbidden / deferred-not-deleted / Zhipu-not-qualify-Anthropic / later-credentials。
- **Tasks** (L1-27)：28 行，Section 1 approval 完成（1.1、1.2 ✅）；Section 2 alignment 完成（2.1-2.4 ✅）；Section 3 qualification rules 完成（3.1-3.4 ✅ + 无代码变更验证说明）；Section 4 verification 3/4 完成（4.3 `[ ]` 为 optional smoke）。

### ✅ harden 合同——语义一致性修改正确

| 位置 | 修改内容 | 验证 |
|---|---|---|
| proposal.md L26-27 | "Qualify the **OpenAI-compatible** provider path ... as the **Gate C required** real-provider family" + "Anthropic Messages real-provider qualification is **deferred / post-Gate-C**" | ✅ 对齐 |
| design.md L5 | "Gate C 真实 Provider **必选** OpenAI-compatible；Anthropic 真实矩阵 **后置**" | ✅ 对齐 |
| design.md L89-91 | 两段分别描述 OpenAI-compatible 为 "Gate C 必选" + Anthropic 为 "deferred / post-Gate-C" | ✅ 对齐 |
| tasks.md L22-23 | 3.1 加 "**Gate C required** real-provider family" 后缀；3.2 改为 "**Deferred / post-Gate-C** — ..." + "(Amended 2026-07-09 via approved `defer-anthropic-from-gate-c`.)" | ✅ 对齐 |
| provider-adapter delta L4 | "Anthropic Messages real-provider qualification is deferred / post-Gate-C and MUST NOT by itself block Gate C overall PASS" | ✅ 对齐 |

### ✅ Stage 0 plan——Gate C 表 + Task 10 修改正确

| 位置 | 修改内容 | 验证 |
|---|---|---|
| L28 Gate C 行 | "redacted **OpenAI-compatible** (required) ... Anthropic real matrix is **deferred / post-Gate-C** ... missing Anthropic credentials MUST NOT block Gate C" | ✅ 对齐 |
| L392-396 Task 10 标题 + Gate C 家族说明 | "Gate C required family (amended 2026-07-09 via `defer-anthropic-from-gate-c`): OpenAI-compatible only" | ✅ 对齐 |
| L403-404 Step 4-5 | 保留 Anthropic fake matrix 步骤但注明 "Supporting; Anthropic real matrix remains deferred" | ✅ 对齐 |
| L408-409 | 明确 "Anthropic real matrix is **deferred / post-Gate-C**: run only when Anthropic credentials are available; absence MUST NOT block Gate C" | ✅ 对齐 |
| L426 Stage 2 signoff | "every **Gate C required** row PASS (OpenAI-compatible real matrix + Java sandbox + MCP; Anthropic real matrix deferred)" | ✅ 对齐 |

### ✅ Dashboard——`defer-anthropic-from-gate-c` 状态正确

- `status: "partial"`——合同对齐完成但未 archive，语义正确。
- `notes` 记录了用户批准日期、对齐范围、无 dual-family hard-require、Zhipu matrix 仍 blocked。
- `harden` 条目 `notes` 最后一条：`"2026-07-09: Gate C provider-family scope amended via approved defer-anthropic-from-gate-c"` — ✅。
- `harden` 条目 `next` 第二条：`"Task 3.2 Anthropic real matrix is deferred/post-Gate-C and no longer blocks Gate C"` — ✅。

### ✅ Worktree 同步——已验证

通过 `diff` 命令确认以下文件主仓 vs worktree 完全一致（无差异）：

- `harden-agent-runtime-single-node-production/proposal.md`
- `harden-agent-runtime-single-node-production/design.md`
- `harden-agent-runtime-single-node-production/tasks.md`
- `harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md`
- `docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md`
- `defer-anthropic-from-gate-c/proposal.md`
- `defer-anthropic-from-gate-c/design.md`
- `defer-anthropic-from-gate-c/tasks.md`

### ✅ 禁止事项检查

| 禁止事项 | 实际状态 |
|---|---|
| 不改 provider 源码 | ✅ 未改 |
| 不 commit | ✅ 未 commit |
| 不关 Gate C | ✅ Gate C 仍 blocked |
| 不 promotion / archive / freeze | ✅ 未做 |
| 不用 Zhipu 替代 Anthropic | ✅ design 明确禁止 |
| ChatGPT OAuth 不混入 | ✅ `add-chatgpt-oauth-auth` 仍 proposed |

### ⚠️ 非阻塞观察——defer tasks 4.3 为 `[ ]`

[defer-anthropic-from-gate-c/tasks.md L26](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/tasks.md#L26-L26)：`4.3 Focused qualification/report tests green (optional smoke; no harness code change this batch)` 标注为 optional 且未勾选。这是合理的——本次无 harness 代码改动，矩阵报告独立运行且无 dual-family aggregator，所以 qualification tests 不需额外 regression。但若后续 archive 此 change 前，建议确认 qualification tests 仍为 green。

## 最终建议

1. **合同对齐复核通过**，全部 8 个改动文件 + worktree 同步均已验证一致。
2. 后续重点：继续 Gate C OpenAI-compatible 证据路径（timeout 结构化错误已修复，还需 retry/terminal_error/cancellation/reasoning harness）。
3. `defer-anthropic-from-gate-c` 可在 Stage 0 closeout 时统一 archive，当前 `partial` 状态合理。
4. `add-chatgpt-oauth-auth` 仍等用户批准（B），不影响本轮。

## 后续门禁

- **OpenSpec**：`defer-anthropic-from-gate-c` 合同对齐完成；`harden-agent-runtime-single-node-production` 仍 active。
- **不需要新 proposal** 来完成本次复核发现的工作。
- **是否修改项目规则**：否。
- **是否仍需 OpenSpec / 后续实施计划**：是。Gate C OpenAI-compatible 证据 + 可选 ChatGPT OAuth 仍需后续推进。

## 验证来源交叉引用

| 你声明的验证项 | 本 review 独立确认 |
|---|---|
| `npx openspec validate defer-anthropic-from-gate-c`：pass | ✅ tasks 4.1 已勾选；alignment review L41 记录 pass |
| `npx openspec validate harden-...`：pass | ✅ tasks 4.2 已勾选；alignment review L42 记录 pass |
| `pnpm dashboard:check`：pass | ✅ dashboard JSON 中 defer 条目结构正确，status=partial |
| 无 dual-family harness 硬合并 Gate C 逻辑 | ✅ tasks 3.1 验证说明 + 3.3 "no code change required" |
| worktree 已同步 | ✅ diff 命令确认 8 个文件零差异 |
