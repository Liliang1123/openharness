# Real Provider Qualification Runner 计划严格预检

## 结论

通过：修订后的 Task 10 可进入 runner 本地实现切片（Step 8–16），但不授权任何真实 Provider 外呼，也不表示 OpenSpec Task 3.1/3.2 完成。当前计划 SHA-256 为 `1c3748f9163de61fd97f424f5614a0da0ce6c83f72c6a3e617d418b8c3f8ff4c`；计划再次变化后必须重新预检。

## Review 范围

- [worktree AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/AGENTS.md)
- [OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/AGENTS.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Provider adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Gate B / Task 3.1/3.2 evidence review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-gate-b-real-provider-evidence-review.md)
- [修订后的 final plan Task 9/10](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Shared qualification schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/packages/shared-schema/src/index.ts)
- [Runtime report/redaction](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/agent-runtime/src/qualification/)
- [Java qualification source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/)
- [Java Provider adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/service/provider/)

## 主要发现

### 首轮 BLOCKED — 已修复

1. 原 Task 10 只要求未来调用 `--real --provider ...`，没有定义可实现的入口、参数或文件边界。修订版固定 Java CLI 入口、允许文件、`--real`、provider、endpoint、model、report path、cost budget、最大输出 token 与定价参数。
2. 原计划没有固定 credential allowlist 与无凭据行为。修订版只允许 `OPENAI_COMPATIBLE_API_KEY` 或 `ANTHROPIC_API_KEY`，禁止 credential 参数、`.env`、环境枚举和 secret 输出；无凭据必须生成全 required-row `blocked` 报告、非零退出且在构造 transport 前返回，以计数 transport 测试证明零外呼。
3. 原计划没有 production required-row 完整性门禁。修订版固定 13 个有序 required rows，缺失、重复、乱序、unsupported、`blocked` 或 `fail` 均 veto overall pass；每行固定 production track、环境、协议/model、capability、request hash、observed sequence、oracle、usage、cost、duration、result。
4. 原计划没有 immutable evidence 写入细则。修订版要求 sibling temp、fsync、写前严格校验、同目录 atomic move、禁止 replace/overwrite、失败清理，并以并发 writer 与 failure-path 测试验收。
5. 原计划未把 request hash、raw usage 对账、cost 复算、reasoning/protocol version、timeout/cancel cleanup 连成可审计调用链。修订版增加 qualification-scoped consume-once exchange capture、raw-versus-adapter usage 对账、overflow-safe USD micros 复算、共享 deadline、cancel/join 与 capture 清理。
6. 原计划混淆“runner 可实现”和“真实 Provider 可运行”。修订版把 Step 16 定义为无真实凭据、无网络的 runner 本地验收；Step 17–20 另设 credential owner 对 endpoint/model/pricing/budget/credential injection/窗口的逐 Provider 授权、真实执行和独立 evidence Review。

### 复审 PASS — 当前执行边界清晰

- Step 8–15 采用逐项 RED/GREEN：config/CLI、固定矩阵、deadline/cancel/budget、atomic/no-overwrite/redaction，命令与预期失败/通过结果明确。
- Step 16 的正式本地验收明确 unset 两类 credential，并要求 process-level 零外呼、全量 Java 回归、现有 TS schema/redaction 回归、OpenSpec strict 与 diff check。
- 真实 OpenAI-compatible 与 Anthropic 必须分开授权、分开进程、分开 immutable report；凭据恰好存在于 shell 不构成授权。
- Provider 不支持 reasoning、stream、multi-step、cancellation 或真实 503 fault injection 时必须 `blocked`。loopback/mock 不能替代真实 production row。
- 计划不包含 `git add`、`git commit`、`git push`、OpenSpec checkbox、dashboard 晋升或 archive 操作。

## 最终建议

进入 Step 8–16 的 runner 本地实现；从 CLI/config RED 测试开始，直到 Step 16 strict acceptance 与实现 Review PASS 才停止。不要在本地实现批次中注入真实凭据或运行 Step 18/19。完成 Step 16 后，由 credential owner 分 Provider 给出 Step 17 的完整授权；缺少 endpoint、model、pricing、cost budget、max-output-tokens、fault-injection capability、report path、credential owner 或执行窗口中的任一项都保持 `BLOCKED`。

## 后续门禁

- OpenSpec：继续使用 active change `harden-agent-runtime-single-node-production`，无需新增 proposal；Task 3.1/3.2 保持未完成。
- Superpowers：实现必须使用 TDD；runner 属于 strict security/external-integration slice，实现后需要独立 Review 与 verification-before-completion。
- 人工授权：Step 16 前不需要真实 credential owner 授权；Step 18/19 前必须分别完成 Step 17。
- Dashboard：本次只修订已批准 change 的执行计划且没有实现/生产证据状态变化，不修改 dashboard。
- Git：本批禁止 commit。

## 预检验证

- `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS，输出 `Change 'harden-agent-runtime-single-node-production' is valid`。命令结束时 OpenSpec telemetry 因 sandbox DNS 无法连接 PostHog，属于非阻塞遥测 warning，不改变 validation 结果。
- `git diff --check`：PASS，无 whitespace error。
- Placeholder/越权扫描：PASS；命中仅为计划和本 review 对禁止词/禁止 Git 操作的说明，未发现可执行 placeholder、自动 commit/push 或真实调用预授权步骤。
