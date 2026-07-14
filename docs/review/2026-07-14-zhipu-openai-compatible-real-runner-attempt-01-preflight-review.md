# Zhipu OpenAI-Compatible Real Runner Attempt 01 Preflight Review

## 结论

通过（PASS）：用户于 2026-07-14 18:30 Asia/Shanghai 在获知 exact endpoint、model、max output、hard cost budget和预期 blocked rows后明确批准一次真实 qualification。此前命令在进程创建前的审批拒绝保持为历史记录；本次授权只允许下述同一 no-overwrite execution，失败不自动重试。

预期 overall为 `blocked`：当前 runner明确没有 provider-backed 503 injection，也未授权 tool/reasoning/timeout/cancellation/terminal-error production fixtures。本 attempt只生成真实、不可覆盖、脱敏证据，不授权把 blocked row改写为 PASS、关闭 Gate C、运行 Anthropic、启动 Gate D、archive或Git发布。

## Review 范围

- [Runner Step 8–16 reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-real-provider-runner-step8-16-reconciliation-review.md)
- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Credential source file](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/.env)
- [Designated no-overwrite report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json)

## 主要发现

### Exact authorization

| 参数 | 授权值 |
| --- | --- |
| Provider | `openai-compatible` |
| HTTPS base endpoint | `https://open.bigmodel.cn/api/paas/v4` |
| Model | `glm-4-flash` |
| Report path | `2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json`（必须不存在） |
| Max output tokens | `64` |
| Cost budget | `1000` USD micros |
| Input/output price | `0 / 0` USD micros per million tokens；官方当前将 GLM-4-Flash列为免费模型 |
| 503 fault injection | 无；required row必须保持 `blocked` |
| Credential injection | 从既有 `ZHIPU_API_KEY`只读加载，映射为 child process的 `OPENAI_COMPATIBLE_API_KEY`；child显式 unset `ZHIPU_API_KEY`与`ANTHROPIC_API_KEY` |
| Network scope | 仅上述 HTTPS endpoint；不启动 Java Gateway或TS Runtime |

定价依据为 [智谱官方 GLM-4-Flash 文档](https://docs.bigmodel.cn/cn/guide/models/free/glm-4-flash-250414)，本 attempt仍保留正数 `1000` USD micros硬预算，任何 report-path collision、credential缺失、HTTP异常、writer拒绝、secret/canary命中均停止。

### Secret与证据边界

- 不输出 credential或其 hash；执行后使用内存中的 raw credential做精确负扫描，只输出 clean/fail。
- Maven stdout/stderr写入 `0600`临时文件；最终只提取 provider/result/rows/report path/SHA-256状态。
- Report writer必须 no-overwrite；目标存在即拒绝，禁止删除后重跑同一路径。
- 固定 redaction canary不得出现在 stdout、stderr或 report；任何命中视为 hard FAIL。

## 最终建议

先确认 report不存在与 credential非空，再运行 production main一次；无论 exit 0/3/2均不得自动重试。随后验证 SHA-256、13-row顺序、result veto、usage/cost、endpoint/model/protocol、secret/canary scan并落盘 Attempt 01 Review。

## 后续门禁

- Exact approval：已于 2026-07-14 18:30 Asia/Shanghai获得；仅限本次指定 execution。
- OpenSpec：3.1只在13个 required rows全部真实 PASS且independent Review通过后才能勾选。
- Anthropic：deferred / post-Gate-C，本次不读取或注入其 credential。
- Dashboard：保持 `proposed`。
- Gate D：不得开始。
- Git：不 staging、commit、push或 archive。
- 项目规则：未修改。
