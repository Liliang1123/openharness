# Stage 0 / Gate B Integration Baseline Closeout Review

## 结论

通过：Stage 0 剩余稳定内容已按四个业务/证据切片完成 fresh verification、精确 commit 与 push；OAuth 完成提交、Stage 0 稳定分支和 Gate B runner 分支已通过保留祖先关系的 merge 汇入单一 integration baseline。两个直接 overlap 文件和一个 integration-only Runtime failure 均已按证据闭环，最终全量本地门禁通过。

该“通过”只表示 Git/OpenSpec integration baseline 建立成功，不表示 `harden-agent-runtime-single-node-production` 已完成。Stage 0 仍为 12/31；Gate B production migration evidence、Gate C required OpenAI-compatible rows、production Gate D、contract freeze、dashboard `verified` 和 OpenSpec archive 均继续 BLOCKED。不得据此创建 parity OpenSpec、更新 parity dashboard、生成 parity implementation plan 或实施 Runtime parity。

## Review 范围

- [Integration worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [Stage 0 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [Gate B worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [前置 overlap/integration audit](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-stage0-gate-b-overlap-integration-audit-review.md)
- [Stage 0 active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)
- [Runtime baseline evaluator](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localBaseline.ts)
- [Formal soak runner tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)
- [OpenAI fake/formal matrix tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [Model controller integration tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

## Stage 0 稳定切片

| 顺序 | Commit | 切片 | 结论 |
| --- | --- | --- | --- |
| 1 | `d26eef8` | OpenAI-compatible formal matrix、timeout/cancellation 合同、脱敏证据、Batch Review | PASS；Gate C overall 仍 blocked |
| 2 | `59a35f4` | formal soak preflight 与 24h local database/sampler evidence | PASS；仅 `local_verified`，不关闭 Gate D |
| 3 | `eb09979` | production runbook、Gate B blocker、Stage 0/Parity 边界审计 | PASS；仅满足文档/审计交付 |
| 4 | `d9719d3` | Anthropic defer、Stage 0 tasks/spec/plan、dashboard proposed 状态 | PASS；active change 不归档 |

四个提交已推送到 `origin/stage0-runtime-production-closeout`。Stage 0 worktree clean，但因仍承载 Gate B/C/D 未完成工作而保留，不删除。

## Integration 顺序与冲突决议

### OAuth

- Merge：`3a0bde2`，整合 OAuth 完成提交 `26f4ebb68de83468b5ee068fbbb7596e07c89014`。
- OAuth final Supervisor/client/test/plan 和 dashboard archived 状态以 `26f4ebb` 为事实源。
- 删除早期 integration 分支遗留的 `openspec/changes/add-chatgpt-oauth-auth/` active 副本；没有重复运行 archive。保留 archive 目录与 current specs。

### Stage 0

- Merge：`3c156b1`，整合 Stage 0 `d9719d3`。
- [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) 保留 Stage 0 timeout/cancel tests，并补回 OAuth pending continuation/cost regression。
- dashboard 以 OAuth archived 条目为基础，补回 Anthropic defer partial 和 Stage 0 24h local evidence / production blocker 口径；随后从 JSON 单一数据源重新 render MD/HTML。

### Gate B

- Merge：`e386f1b`，整合 Gate B `7fc5ef731b5af300789d211867f86378107ea010`。
- [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) 保留 Stage 0 formal matrix/terminal-error tests，同时加入 Gate B raw usage 与 parser event capture tests。
- Stage 0 final plan 保留 Anthropic post-Gate-C deferred 修订，同时加入 Gate B runner Step 8–20 的 secret-safe、fixed-row、budget、no-overwrite、authorization 和 independent Review 合同。

## Integration-only Failure 与修复

### RED

Runtime 全量首次运行：329/330 PASS，`formalSoakRunner.test.ts` 1 FAIL。合并后的 formal runner 为 RSS/FD 增长写入专用 hard failure；较新的通用 baseline evaluator 又为相同指标生成 `RESOURCE_GROWTH_BREACH`，同一事实重复为四条 failure。

### 根因

两个分支分别在不同层实现资源增长检测，单独运行时各自正确；integration 后同时生效。formal soak 合同要求专用 `RSS_MEDIAN_GROWTH_LIMIT_EXCEEDED` / `FD_MEDIAN_GROWTH_LIMIT_EXCEEDED`，普通 baseline 合同要求通用 `RESOURCE_GROWTH_BREACH`。

### 修复与 GREEN

在 [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localBaseline.ts) 中仅当对应 formal 专用 code 不存在时生成通用 resource-growth failure。普通 baseline 行为不变，formal report 不再重复记录同一事实。

- focused `formalSoakRunner.test.ts + localBaseline.test.ts`：10/10 PASS。
- Runtime full：330/330 PASS。
- Runtime typecheck：PASS。

## Fresh Final Verification

所有 Provider credential 变量均显式 unset；未读取、显示或落盘 secret，未执行真实 Provider、生产迁移或 Gate D。

| Gate | 结果 |
| --- | --- |
| Backend Maven full | 200/200 PASS |
| shared-schema | 58/58 PASS；typecheck PASS |
| Agent Runtime | 330/330 PASS；typecheck PASS |
| Frontend | 24/24 PASS；typecheck PASS |
| Integration | 17/17 PASS |
| Gate B/Stage 0 overlap focused | 46/46 PASS |
| ModelController merged focused | 6/6 PASS |
| OpenSpec strict all | 24/24 PASS |
| Dashboard | 34 entries；generated outputs current |
| Git | `git diff --check` PASS；OAuth/Stage 0/Gate B stable SHAs 均为 integration HEAD ancestors |

## 当前单一事实源

- OAuth：dashboard `archived`；只有 archive OpenSpec/current specs，不存在 active duplicate。
- `defer-anthropic-from-gate-c`：active 13/14，dashboard `partial`；Anthropic 为 post-Gate-C deferred。
- `harden-agent-runtime-single-node-production`：active 12/31，dashboard `proposed`。
- Runtime parity：没有 OpenSpec proposal、dashboard entry 或 implementation code。

## 主要发现

### Pass — Git / OpenSpec 视图已统一

OAuth、Stage 0、Gate B 不再依赖三个互不包含的 dirty worktree 解释状态；integration 分支包含三条稳定 SHA 的真实祖先关系，且 OpenSpec/dashboard 对同一状态给出一致结果。

### Blocked — Stage 0 production closeout 仍未完成

缺失项没有因 integration 被消除：Gate B production backup/import/quarantine/restore/RPO-RTO、Gate C required real OpenAI-compatible rows、production Gate D fixed workload/TS restarts/promotion、full production qualification、contract freeze 和 closeout/archive 均仍需后续证据与授权。

### Blocked — Runtime parity 仍不可启动

项目既定门禁要求先完成并归档 `harden-agent-runtime-single-node-production`。当前仍为 active 12/31，因此本轮只建立 baseline，不创建 parity proposal 或实现。

## 最终建议

1. 将本 integration 分支作为后续 Stage 0 的唯一 Git/OpenSpec 基线，不再从旧 worktree HEAD 单独推断状态。
2. 保留 Stage 0 与 Gate B worktree；它们虽已 clean/pushed，但对应任务整体未完成。
3. 下一步必须在获得对应明确授权后，按顺序补 Gate B production evidence、Gate C required rows、Gate D 与 final closeout；不能用本地/fixture evidence 替代。
4. 只有 Stage 0 Review PASS、dashboard archived 和 OpenSpec archive 后，才创建 spec-only Runtime parity roadmap proposal。

## 后续门禁

- OpenSpec：继续使用 active `harden-agent-runtime-single-node-production` 与 `defer-anthropic-from-gate-c`；不新增 parity change。
- Superpowers：后续真实 Provider、生产迁移、Gate D 为 strict evidence slices，仍需授权、TDD/verification、独立 Review 和 final verification。
- 人工审批：真实 Provider endpoint/model/cost/credential、Gate B production evidence、Gate D start/promotion、archive 均未获本轮授权。
- 项目规则：本轮未修改。
