# Real Provider Qualification Runner Step 8–16 Correction Brief

## 项目与必读材料

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[gate-b-real-provider-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)
- 必读 Review：[Step 8–16 Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-implementation-review.md)
- 必读计划：[Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- 批准合同：[harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)

## 任务目标

只修复 Runner Step 8–16 的三个 High finding，使 CLI 在未来获得显式授权与 credential 后已具备完整可执行链，同时本批仍完全使用 fake/counting transport，不进行真实网络调用。

## 必须修复

1. 使用 TDD 补齐 credential-present 路径：provider-specific transport factory 必须返回可执行的 typed transport，Runner 调用固定 13 行 matrix、生成严格 report 并通过 immutable writer 发布；禁止保留 `new Object()` 或 `execution is not available yet` 占位路径。
2. budget admission 必须由配置价格、`maxOutputTokens` 和固定 fixture UTF-8/token 上界内部计算，不接受任意 caller-supplied worst-case cost。每行写入前后都必须保持累计 cost 不超过预算。
3. 写前验证必须核对 raw-provider 与 adapter usage、按各 usage class 复算 cost、验证 row cost 和 total cost，并拒绝 High probe 中预算 1,000/报告 13,000 的伪造 PASS。
4. 修复 atomic no-overwrite：非协作进程在线性化窗口创建目标时，writer 必须失败且保持目标 byte-identical。加入等待 sibling temp 后创建目标的确定性回归测试。
5. 保留并重跑已通过的无凭据零构造、13 行顺序/veto、deadline/cancel/capture cleanup、recursive redaction、协作 writer 单 winner 与 failure cleanup 测试。

## 允许范围

- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [对应 qualification tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification)
- 只有 qualification-scoped sanitized capture/wiring 确有需要时，才允许修改既有 Provider adapter 及对应测试；不得改变普通请求行为、retry 阈值、routing 或 production defaults。

## 禁止事项

- 不执行 Step 17–20，不连接任何真实 endpoint，不读取或打印真实 credential。
- 不把 loopback/mock 证据标记为 production PASS。
- 不勾 OpenSpec 3.1/3.2，不修改 dashboard，不归档 change。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不重写或删除本轮 Review、既有 preflight、Gate B evidence Review。

## Fresh 验证与 Report

完成 RED/GREEN 后运行 Task 10 Step 16 的全部正式命令、canary 扫描、OpenSpec strict 和 `git diff --check`。最终回传 `DONE_WITH_CONCERNS` 或 `BLOCKED` Report，包含 actual diff、三项 finding 的 RED/GREEN 原始证据、测试数量与 exit code、最终 `git status --short`、零真实外呼证明和残余风险。不要自行宣称 Step 8–16 PASS；High 将重新审查 actual diff 并增加独立 probe。
