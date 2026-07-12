# Gate B 与真实 Provider 3.1/3.2 证据审计

## 结论

有风险：Gate B、OpenSpec Task 3.1 和 Task 3.2 均不可关闭。现有 deterministic、fixture 与 loopback fake 证据通过本地复核，但严格门禁要求的生产迁移制品和真实 Provider 生产矩阵均不存在；当前 worktree 也没有可执行的真实 Provider qualification CLI。不得以本地测试、fake Provider 报告或既有人工意向批准替代生产证据。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Stage 0 / Runtime v1 final plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- [Task 8 fixture rehearsal](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md)
- [Task 10 fake Provider evidence](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task10-fake-provider-matrix.md)
- [OpenAI-compatible local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-openai-compatible-local.json)
- [Anthropic local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-anthropic-local.json)
- [Provider qualification source](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/)
- [Provider adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Development dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

## 验收条件、已有证据与缺口

### Gate B — pre-cutover

验收条件：生产 backup hash manifest、生产 import report、quarantine report 与人工 decision、真实 restore output、forward-fix-only marker、实测 backup RPO/RTO、crash matrix、完整 deterministic tests，并在证据齐全后获得人工 Gate B 批准；第一笔真实生产 SQLite write 前必须全部满足。

已有证据：fixture 级 backup/import/quarantine/restore/forward-fix rehearsal；人工批准意向已于 2026-07-06 记录；本次复跑 importer/crash focused tests 与 Runtime typecheck 通过。

缺口：未发现生产 backup manifest、生产 import report、生产 quarantine decision、生产 restore output、生产 forward-fix marker 或实测生产 RPO/RTO。既有人工批准不能对不存在的严格证据生效。结论保持 `pending_production_evidence`，禁止首次真实生产 SQLite cutover write。

恢复条件：生产环境 owner 在不暴露业务内容或秘密的证据目录中提供上述完整 bundle；Review 校验 hash、count、quarantine decision、restore observation、RPO/RTO 和 forward-fix marker 后，再请求人工 Gate B promotion。

### Task 3.1 — OpenAI-compatible

验收条件：通过 Java Gateway 对真实 Chat Completions-compatible endpoint 分别覆盖 sync、stream、single/multi-step tool calls、structured arguments、reasoning、usage token 精确对账、cost 精确复算、503 retry、共享 timeout deadline、cancellation、terminal error 与 redaction；每行必须记录 production track、环境指纹、协议/API/model version、capability prerequisites、redacted request hash、observed sequence、oracle、usage/cost、duration 和 result。缺凭据或 required capability 必须 `BLOCKED`，不得 fallback 到 mock。

已有证据：loopback fake 的 `track=local` / `result=local_verified` 报告，以及本次 12 个 focused Provider tests 和 Backend 45-test full suite。它们可证明本地 adapter/harness 回归，但不能证明真实 endpoint、真实 usage/cost 或真实 capability。

缺口：所有已知 OpenAI-compatible credential/base-url 环境变量均未设置，worktree 内无 `.env`；没有 production-track immutable report；代码搜索只发现 `OpenAiFakeProviderMatrix` 和 loopback `QualificationReportPromoter`，未发现 final plan 声明的 `--real --provider ...` CLI。即使之后仅注入凭据，当前也没有可审计地生成完整 production matrix 的入口。

恢复条件：先按已批准 OpenSpec 与 TDD 实现/评审真实 qualification runner（不得读取或打印 secret，默认 no-overwrite，强制 production schema 与 required-row veto）；随后由 credential owner 明确授权真实 endpoint/model/cost budget，注入 secret 后运行并落盘 redacted immutable report，再独立 Review。

### Task 3.2 — Anthropic

验收条件：通过 Java Gateway 对真实 Messages API 覆盖与 Task 3.1 对等的矩阵，并固定、记录 `anthropic-version`；usage 还需包含并核对适用的 cache read/write token，reasoning signature/能力要求不得静默降级。

已有证据：loopback fake 的 `track=local` / `result=local_verified` 报告；本次 focused/full Java 回归通过。

缺口：`ANTHROPIC_API_KEY` 与可选 base-url 均未设置，worktree 内无 `.env`；没有 production-track immutable report；没有真实 qualification CLI。真实 model 是否支持 required reasoning、stream、cancellation 和 multi-step tool 能力也尚未被实测，因此整体必须 `BLOCKED`。

恢复条件：与 Task 3.1 相同，先补齐经 TDD/Review 的真实 runner，再由 credential owner 明确 endpoint/model/version/cost authorization，运行完整矩阵并独立 Review；任何 required capability 不支持均保持 `BLOCKED`，不能 skip 后 PASS。

## 主要发现

### 阻塞 — Gate B 缺少生产数据与生产恢复证据

本地 fixture rehearsal 与正式生产 cutover 的数据、时间和恢复环境不同，无法证明真实 RPO/RTO、quarantine decision 或 restore 可用性。当前没有权限或生产数据上下文可安全生成这些证据。

### 阻塞 — Task 3.1/3.2 缺少凭据授权和真实执行入口

本次只检查变量是否设置，没有读取或输出任何变量值。所有相关变量为 unset；仓库内也没有被 final plan 要求的真实矩阵 CLI。直接调用公开 endpoint 会同时缺少授权、模型/cost budget 与证据 writer，不能形成有效验收证据。

### 高风险 — fake/local evidence 不能转写为 production evidence

两份现有 Provider 报告明确标记 `track=local`，transport 为 loopback fake server。将其改名、复制或仅改字段会制造假合同，严格禁止。

### 一致性 — OpenSpec tasks 与 dashboard 不应晋升

[OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 中 Gate B 保持未完成、3.1/3.2 保持未完成，与证据一致；dashboard 仍为 `proposed`，也与“不得用 local evidence 晋升 verified”一致。本次没有修改 tasks 或 dashboard。

### 已修复 — Task 8 正式命令未命中迁移测试

原 Task 8 命令的 `migration` 过滤词没有命中测试文件；迁移用例实际位于 `runtimeStorage.test.ts`。已在 [Stage 0 / Runtime v1 final plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md) 将该过滤词修正为 `runtimeStorage`，随后复跑 importer、runtime storage/migration 与 crash matrix。该修正只恢复计划原有验证意图，不改变 OpenSpec 合同或生产门禁。

## 本地预检与验证

- 修订后 Plan Preflight Review：`PASS`。Task 8 命令现在命中 importer、runtime storage/migration 与 crash matrix，未扩大文件/生产权限，也未改变 rollback/stop condition。
- `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,QualificationReportPromoterTest,OutboundRequestTrackerTest test`：通过，12 tests，0 failures/errors/skips。
- `mvn -f backend/pom.xml test`：通过，45 tests，0 failures/errors/skips。
- `pnpm --filter @openharness/shared-schema test`：通过，49 tests。
- `pnpm --filter @openharness/shared-schema typecheck`：通过。
- `pnpm --filter @openharness/agent-runtime test -- qualificationReport qualificationRedaction`：通过，5 tests。
- `pnpm --filter @openharness/agent-runtime test -- jsonImporter migration crashMatrix`（修正前审计）：通过，但 Vitest 实际只执行 2 files / 15 tests；`migration` 未命中测试文件。
- `pnpm --filter @openharness/agent-runtime test -- jsonImporter runtimeStorage crashMatrix`（计划修正后）：通过，3 files / 19 tests；明确包含 `runtimeStorage.test.ts` 的 4 个 migration/storage tests。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- Provider 配置预检：仅检查 known variable 是否非空；OpenAI-compatible/Anthropic credential 与 base-url 变量均 unset，worktree 内 `.env` / `backend/.env` / `agent-runtime/.env` 均 absent；未读取、打印或持久化任何 secret。

## 最终建议

1. 保持 Gate B 为 `pending_production_evidence`；由生产数据 owner 准备真实 migration/cutover bundle，不在开发 worktree 伪造。
2. 将“真实 Provider qualification runner”作为 Task 3.1/3.2 的首个未完成实现切片：TDD 覆盖 secret-safe config preflight、production track schema、required-row veto、no-overwrite、redaction、完整 row 生成和无凭据 `BLOCKED` 输出。
3. runner Review PASS 后，再由 credential owner 提供显式 endpoint/model/cost authorization 并注入 secret；真实调用必须单 Provider 分开执行、生成不可覆盖报告并做 post-run secret scan。
4. 在 Gate B、3.1、3.2 生产证据分别 Review PASS 前，不更新 OpenSpec checkbox，不晋升 dashboard，不归档 active change。

## 后续门禁

- OpenSpec：继续使用 active change `harden-agent-runtime-single-node-production`；真实 runner 已被现有合同覆盖，无需新 proposal，但实现前必须按既有 Superpowers plan 做当前 revision Preflight，并以 TDD 实施。
- Superpowers：真实 runner 属于 strict auth/external-integration slice，需要 TDD、focused/full verification、独立 Review 与 verification-before-completion。
- 人工审批：Gate B 需要 production evidence bundle Review 后的最终批准；真实 Provider 调用需要 credential owner 对 endpoint/model/cost 的显式授权。
- 项目规则：本次未修改。
