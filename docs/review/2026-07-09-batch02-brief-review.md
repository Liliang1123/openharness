# Batch 02 Brief Review

## 结论

**通过**：Batch 02 Brief 满足 Batch 01 PASS → Batch 02 实施的衔接要求，scope 精准（Zhipu production re-run + evidence），禁止清单完备，handoff contract 与 status.md 一致，所有依赖文件存在。存在 2 项非阻塞观察和 1 项建议，不影响实施方按此 brief 执行。

## Review 范围

| 文件 | 角色 |
|---|---|
| [02-brief.md (main)](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/02-brief.md) | 被 review 的 Batch 02 实施 brief |
| [02-brief.md (worktree)](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/agent-collab/harden-agent-runtime-single-node-production/02-brief.md) | worktree 副本 |
| [status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md) | handoff contract 权威状态 |
| [01-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md) | 前序 Batch 01 执行报告 |
| [step-01-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-harden-agent-runtime-single-node-production-step-01-review.md) | 前序 Batch 01 Governor review |
| [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) | OpenSpec 任务勾选状态 |
| [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) | formal harness 入口 + CLI 参数解析 |

## 主要发现

### ✅ Handoff Contract 一致性——PASS

Brief §2.1 与 status.md 中的 `COOP_HANDOFF_CONTRACT` YAML 块逐字段对比：

| 字段 | Brief | status.md | 一致 |
|---|---|---|---|
| `schema_version` | 1 | 1 | ✅ |
| `change_id` | harden-agent-runtime-single-node-production | 同上 | ✅ |
| `mode` | approved-implementation | 同上 | ✅ |
| `approval_status` | approved | 同上 | ✅ |
| `risk_profile` | strict | 同上 | ✅ |
| `current_batch` | 2 | 2 | ✅ |
| `planned_batches` | 3 | 3 | ✅ |
| `batch_01_review` | PASS | PASS | ✅ |
| `batch_02_brief` | READY | READY | ✅ |
| `executor` | external-agent | external-agent | ✅ |
| `governor` | codex-brief-antigravity-review | 同上 | ✅ |
| `next_owner` | external-agent | external-agent | ✅ |
| `step_critical` | 7 items | 7 items（同） | ✅ |
| `final_critical` | 3 items | 3 items（同） | ✅ |
| `stop_conditions` | 7 items | 7 items（同） | ✅ |
| `readonly_fields` | mode, approval_status, risk_profile | 同上 | ✅ |

### ✅ 前序依赖——全部存在

7/7 个 brief §7 引用的需求来源文件均存在：

- [01-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md)
- [step-01-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-harden-agent-runtime-single-node-production-step-01-review.md)
- [provider-adapter spec.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [defer-anthropic design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/defer-anthropic-from-gate-c/design.md)
- [previous production JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)
- [formal local JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-openai-compatible-formal-local.json)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

### ✅ Tasks 边界——未勾选

tasks.md 中 3.1、3.2、3.5、3.6 均为 `[ ]`。

### ✅ Main/Worktree 一致性

- `02-brief.md`：`diff` 无差异 ✅
- `status.md`：`diff` 无差异 ✅

### ✅ Scope 精准性——单一业务切片

Brief §2 明确唯一目标：使用 formal harness 重跑 Zhipu production matrix 并落盘 evidence。§2 的 "本步不是" 列表覆盖了 10 项禁止行为。§8 的子问题矩阵逐行声明覆盖/不覆盖边界，与 stop_conditions 一致。

### ✅ 禁止清单完备性

| 维度 | Brief 是否覆盖 | 位置 |
|---|---|---|
| git commit/push/reset/clean | ✅ | §4, §5, stop_conditions |
| Gate C 关闭 | ✅ | §2, §10, stop_conditions |
| tasks 勾选 | ✅ | §2, §4, stop_conditions |
| mock PASS | ✅ | §2, §2.2, §10, stop_conditions |
| unsafe real errors | ✅ | §2, §8, §8.1 |
| secret 打印/泄露 | ✅ | §4, §6, stop_conditions |
| Anthropic 替代 | ✅ | §2, stop_conditions |
| OAuth 实施 | ✅ | §2, §4, stop_conditions |
| archive/freeze | ✅ | §2, §4 |
| 不相关进程 kill | ✅ | §6 |

### ✅ 验证命令——完整且可执行

§9 的命令序列覆盖：

1. **Preflight**：git status + .env 存在性检查 + key 存在性（无 echo）
2. **Backend 启动**：`spring-boot:run` 端口 18084 + health check
3. **Production formal matrix**：`spring-boot:run` with `--track=production --backend-url=... --provider-name=zhipu --model=glm-4-flash --output=../$REPORT`
4. **Critical commands**：Maven focused tests + shared-schema tests + 2x OpenSpec validate + production JSON 结构校验 + secret scan + `git diff --check`

CLI 参数与 [CliOptions.parse()](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java#L581-L629) 逐字段匹配，包括 `--track=`、`--backend-url=`、`--provider-name=`、`--model=`、`--output=`。`../` 相对路径在 `backend/` 子目录执行时正确回到 worktree root。

### ✅ 数据合同——与 shared-schema 对齐

§8.1 数据合同表的 `track`、`result`、`rows[].id`、`rows[].requestHash`、`rows[].observed.*` 字段与 formal harness 实际输出结构一致（已通过 01 review 的 shared-schema 49 tests 验证）。

### ✅ 阻塞处理——完善

§12 列出 6 类 abort/BLOCKED 条件，每类要求写明 git status、失败命令、backend 状态、部分 JSON、密钥安全、下一步。覆盖面足够。

### ✅ Production JSON 验证 Node.js inline script——正确

§9 的 inline `node -e "..."` 脚本验证了：
- `track === 'production'`
- `result ∈ {pass, fail, blocked}`
- 9 个 expected row ids 全部存在
- retry / terminal_error / cancellation 必须 `blocked` 且 `requestSent === false`

逻辑正确，与 §10 验收标准一致。

### ⚠️ 非阻塞 Observation 1——secret scan 预期 exit code

§9 secret scan 命令后注释 `Expected for secret scan: exit 1, no matches`。`rg` 在无匹配时确实返回 exit 1——正确。但如果实施方在 shell 中使用 `set -e`，exit 1 会终止脚本。Brief 没有要求使用 `set -e`，但建议实施方注意此行为。

**严重度**：信息级。实施方只需知道 `rg` exit 1 = 无匹配 = PASS。

### ⚠️ 非阻塞 Observation 2——production JSON 文件名固定日期

§9 使用 `REPORT=...2026-07-09-zhipu-openai-compatible-production-formal-batch02.json`。如果实施方在 7月10日或之后执行，日期仍为 7月9日。这不影响正确性（文件名只是标识），但可能在审计时造成困惑。

**严重度**：低。实施方可按 brief 原文执行；若跨日执行，report 中注明即可。

### 建议——实施方提示词与 brief 对齐

用户提供的实施方提示词完整覆盖了 brief 核心约束（worktree、必读文件、禁止事项、输出路径）。提示词中 `safe rows 要真实调用` 与 brief §6 / §8 / §10 一致。提示词中 `retry / terminal_error / cancellation 无安全真实路径时继续 blocked 且 requestSent=false` 与 brief §8 / §9 验证脚本一致。

**唯一建议**：提示词中可追加一句 `secret scan 中 rg exit 1 表示无匹配 = PASS，不要误判为 FAIL`，防止实施方困惑。

## 验证记录

| 检查项 | 结果 |
|---|---|
| main/worktree `02-brief.md` diff | 无差异 ✅ |
| main/worktree `status.md` diff | 无差异 ✅ |
| `current_batch` = 2 | ✅ |
| `next_owner` = external-agent | ✅ |
| `batch_01_review` = PASS | ✅ |
| `batch_02_brief` = READY | ✅ |
| tasks 3.1/3.2/3.5/3.6 = `[ ]` | ✅ |
| 7/7 依赖文件存在 | ✅ |
| CLI 参数与 CliOptions.parse() 匹配 | ✅ |
| brief YAML ↔ status.md YAML 一致 | ✅ |
| formal harness main + runProduction 存在 | ✅ |

## 最终建议

1. **Brief 可直接交付实施方执行**。所有依赖就绪，禁止清单完备，验证命令可执行。
2. 实施方提示词建议追加 secret scan exit code 说明（非阻塞）。
3. 若实施方跨日执行，report 中注明文件名日期与执行日期不同即可。
4. Gate C 仍 blocked，本 brief 正确约束了不关闭 Gate C、不勾选 tasks、不 commit。

## 后续门禁

- **OpenSpec proposal**：不需要新 proposal。
- **Superpowers plan**：不新增。
- **测试门禁**：brief §9 step_critical 覆盖充分。实施方执行后由 Governor re-run。
- **人工审批**：Batch 02 report 需 Governor/Grok review 后才能进入 Batch 03。
- **是否修改项目规则**：否。
- **是否仍需 OpenSpec / 后续实施计划**：active change 仍 open；Batch 03 待 Batch 02 review 后规划。

## Review Closeout

- 落盘文件：[2026-07-09-batch02-brief-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-batch02-brief-review.md)
- 是否修改项目规则：否
- 是否仍需 OpenSpec：active change 仍 open，不新增 proposal
