# Real Provider Qualification Runner Step 8–16 Implementation Review

## 结论

需修改。无凭据 BLOCKED、固定 13 行、基础 veto、focused/full 回归和 canary 边界已通过；但 actual diff 与 High 独立 probe 证明 Runner 尚未具备真实矩阵执行链，report writer 未执行 usage/cost/budget 完整性校验，并且当前 `ATOMIC_MOVE` 方案可在非协作进程竞争下覆盖已出现的目标文件。Task 10 Step 8–16 不得判定 PASS，Step 17–20 禁止开始，OpenSpec 3.1/3.2 保持未完成。

## Review 范围

- [项目规则](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)
- [OpenSpec 规则](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- [Runtime production OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)
- [Task 10 实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Runner 预检 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-plan-preflight-review.md)
- [RealProviderQualificationRunner.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [RealProviderQualificationConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java)
- [RealProviderQualificationMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [QualificationExchangeCapture.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [QualificationReportWriter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [qualification tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification)

## 主要发现

### 高：有凭据路径没有执行 13 行矩阵，Step 18/19 不可运行

[RealProviderQualificationRunner.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java) 第 15–33 行的生产 `main` 使用 `config -> new Object()`；有凭据时仅调用一次 `transportFactory.create(config)`，随后固定输出 `qualification transport execution is not available yet` 并返回 2。它没有调用 `RealProviderQualificationMatrix.execute`，没有绑定 OpenAI-compatible/Anthropic adapter，没有生成任何 production report。

High 独立 probe 注入合成 credential 与计数 factory，观察到 `exit=2`、`constructions=1`、`reportExists=false`。Step 17 只负责 credential-owner 授权，Step 18/19 已规定直接运行该 CLI；因此不能把生产执行链留到 Step 17–20 再实现。修复必须在 Step 8–16 同 scope 内完成可执行 transport/matrix/report wiring，同时继续以假 transport 做本地验证，禁止真实外呼。

### 高：writer 接受 usage/cost 与预算不一致的伪造 PASS 报告

[RealProviderQualificationMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java) 第 152–185 行只检查 cost 为非负数；`totalCost` 被累计但从未与预算比较，也未从 usage 和配置价格复算。第 47–58 行的 `worstCaseNextRowCostMicros` 由调用者直接传入，而不是由 fixture UTF-8 上界、`maxOutputTokens` 和配置价格计算。

High probe 使用配置预算 1,000 micros，将 13 行全部标为 PASS、每行 cost 1,000 micros，并放入极大 usage；[QualificationReportWriter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java) 仍成功发布总 cost 13,000 micros 的报告。该结果违反计划中的写前 cost invariant、预算上限、raw-versus-adapter usage 对账和成本复算门禁。

### 高：当前 atomic move 可覆盖竞争窗口中新出现的目标

[QualificationReportWriter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java) 第 50–63 行的 lock 只约束遵守同一 lock 协议的 writer。第二次 `Files.exists(target)` 与 `Files.move(temp, target, ATOMIC_MOVE)` 之间仍有 TOCTOU 窗口；在当前 macOS 文件系统上，`ATOMIC_MOVE` 会替换该窗口中新出现的目标。

High probe 等待 sibling temp 创建后由非协作线程写入目标，实际观察 `attackerCreated=true`、`writerSucceeded=true`，最终目标内容为 qualification report 而不是攻击线程写入的原内容。该实现不满足 immutable/no-overwrite 证据要求。修复需要在目标文件系统上具备原子 create-if-absent 发布语义，或使用经验证不会替换目标的同目录原子提交协议；必须保留非协作竞争回归测试。

### 中：现有测试只覆盖安全子集，无法证明上述生产合同

[RealProviderQualificationRunnerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationRunnerTest.java) 仅覆盖缺凭据路径；没有断言 credential-present 路径会执行固定矩阵并发布报告。[QualificationReportWriterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/QualificationReportWriterTest.java) 的并发测试仅覆盖两个协作 writer，没有覆盖外部目标竞争；matrix tests 也没有 writer 拒绝 usage/cost/budget 不一致的负例。

## 已通过证据

- 无凭据真实 CLI probe：exit 3，生成 `track=production`、`result=blocked`、固定 13 行全 blocked 报告；SHA-256 与 CLI 输出一致。
- 无凭据测试证明 transport construction 为 0，因此该路径没有 transport call；两个 credential 变量均显式 unset。
- 固定行的缺失、重复、乱序和 blocked/fail veto 基础验证通过。
- timeout 测试证明 cooperative transport 会收到 interrupt、worker 结束、capture 清空。
- recursive redaction、canary fixture 边界、已有目标保护和两个协作 writer 单 winner 测试通过。
- 本轮未执行真实 Provider 外呼，未读取真实 credential，未执行 Step 17–20。

## Fresh 验证

- `env -u OPENAI_COMPATIBLE_API_KEY -u ANTHROPIC_API_KEY mvn -f backend/pom.xml -Dtest=RealProviderQualificationRunnerTest,RealProviderQualificationConfigTest,RealProviderQualificationMatrixTest,QualificationReportWriterTest,OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,OutboundRequestTrackerTest,QualificationRedactorTest test`：27/27 PASS。
- `mvn -f backend/pom.xml test`：61/61 PASS。
- `pnpm --filter @openharness/shared-schema test`：49/49 PASS；typecheck PASS。
- `pnpm --filter @openharness/agent-runtime test -- qualificationReport qualificationRedaction`：5/5 PASS；typecheck PASS。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid，exit 0；PostHog DNS telemetry warning 为非阻塞 warning。
- `git diff --check`：PASS。
- canary scan：仅命中 4 处指定 Java 测试 fixture；未命中生成报告或 evidence 目录。
- High 独立 probe：复现 credential path 不可执行、超预算伪造 PASS 被接受、非协作目标竞争被覆盖；临时源码、class、classpath、报告与临时目录均已删除。

## 最终建议

只做 Runner Step 8–16 correction：补齐 credential-present 的 adapter/transport→13 行 matrix→immutable writer 完整调用链；从配置和固定 fixture 上界内部计算预算 admission；在发布前严格校验 raw/adapter usage、复算 cost 与总预算；修复非协作 no-overwrite 原子发布，并加入三个 High probe 对应的正式回归测试。完成后重新执行 Step 16 fresh matrix并回传 Report。

## 后续门禁

- 继续使用 active OpenSpec change `harden-agent-runtime-single-node-production`，无需新增 proposal。
- Step 8–16 Review FAIL；不得勾计划 Step 8–16，不得进入 Step 17–20。
- OpenSpec 3.1/3.2、dashboard `verified`、真实 Provider execution 与 archive 均保持 BLOCKED。
- 不读取真实 credential，不执行真实网络调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次未修改项目规则、OpenSpec tasks、dashboard 或实现文件。
