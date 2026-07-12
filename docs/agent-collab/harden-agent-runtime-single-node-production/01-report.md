# Batch 01 Implementation Report

## 结论

通过实施，等待 Grok Review。Batch 01 已完成 OpenAI-compatible formal matrix harness 的 TDD 实现与本地证据落盘；未关闭 Gate C，未勾选 tasks，未 commit / archive / promotion。

本报告同步目标：
- Worktree: [01-report.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md)
- Main repo: [01-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md)

## 变更范围

- 新增 formal harness: [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)
- 增强 fake matrix 证据字段: [OpenAiFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- 增加 TDD 覆盖: [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- 新增 local formal evidence: [2026-07-09-openai-compatible-formal-local.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-openai-compatible-formal-local.json)
- 复用既有真实 Zhipu evidence 输入: [2026-07-09-zhipu-openai-compatible-production.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)

## 实施内容

1. 新增 `OpenAiCompatibleFormalMatrix`：
   - `track=local`: 启动 loopback OpenAI-compatible fake server，调用现有 `OpenAiFakeProviderMatrix`，生成 shared-schema 兼容 JSON。
   - `track=production`: 通过 backend `/api/v1/model/chat` 执行安全行；retry / terminal_error / cancellation 无安全真实注入路径时写入 `blocked`，且 `observed.requestSent=false`。
   - CLI 支持 `--track`、`--backend-url`、`--model`、`--provider-name`、`--output`；token 只通过运行时参数/环境读取，不写入 report。
2. local fake 证据增强：
   - retry: `attempts=2`、`providerHitCount=2`、`firstStatus=503`、`terminalStatus=200`。
   - terminal_error: `status=400`、`terminalErrorClass=Provider error 400`。
   - cancellation: `cancelled=true`、`interruptedCaught=true`、`threadCompleted=true`。
   - environment fingerprint 增加 provider family、harness、Java version、OS。
3. 修正 `matrix-usage` 未列入 fake provider model list 的证据问题，避免 usage 行退回 sync 模型并复用相同 request hash。
4. production formal path 通过 fake backend JUnit 验证：
   - safe rows 实际发送 5 个 backend request。
   - retry / terminal_error / cancellation / reasoning 均为 `blocked`，不 mock PASS。
   - timeout 保持结构化 `PROVIDER_TIMEOUT` / `structuredStatus=504`。

## TDD 记录

- RED: `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test`
  - exit 1
  - 失败点：`OpenAiCompatibleFormalMatrix` 类缺失，`OpenAiFakeProviderMatrixTest` 5 个 compile errors。
- GREEN: 同一 Maven focused 命令最终通过。
  - exit 0
  - `Tests run: 12, Failures: 0, Errors: 0, Skipped: 0`

## Evidence

Local formal report:
- [2026-07-09-openai-compatible-formal-local.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-openai-compatible-formal-local.json)
- `track=local`
- `result=local_verified`
- `rows=9`

能力状态：

| Row | fake/local | production real status |
|---|---:|---|
| timeout | pass | 既有 Zhipu report pass: `PROVIDER_TIMEOUT`, `structuredStatus=504` |
| retry | pass, `providerHitCount=2` | blocked: no safe real 503 injection path |
| terminal_error | pass, `status=400` | blocked: no safe invalid-request/auth mutation path executed |
| cancellation | pass, interrupt observed | blocked: no public production chat cancellation endpoint |

Real provider 调用：
- 本批未新增真实 provider 调用。
- 既有 Zhipu production evidence 保留为输入，不改写、不提升 Gate C: [2026-07-09-zhipu-openai-compatible-production.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)
- Anthropic 仍 deferred/post-Gate-C，未当作 Gate C required，未 fake PASS。

Harness 使用命令：

```bash
mvn -f backend/pom.xml -DskipTests spring-boot:run -Dspring-boot.run.main-class=org.openharness.backend.qualification.OpenAiCompatibleFormalMatrix -Dspring-boot.run.arguments="--track=local --output=../docs/verification/agent-runtime-v1/providers/2026-07-09-openai-compatible-formal-local.json"
```

Production harness future command shape:

```bash
mvn -f backend/pom.xml -DskipTests spring-boot:run -Dspring-boot.run.main-class=org.openharness.backend.qualification.OpenAiCompatibleFormalMatrix -Dspring-boot.run.arguments="--track=production --backend-url=<backend-root> --provider-name=zhipu --model=glm-4-flash --output=../docs/verification/agent-runtime-v1/providers/<stamp>-zhipu-openai-compatible-production.json"
```

## Step Critical

Workdir: [stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout)

| Command | Exit | Result |
|---|---:|---|
| `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test` | 0 | 12 tests passed |
| `pnpm --filter @openharness/shared-schema test -- schema` | 0 | 49 tests passed |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | 0 | valid; PostHog telemetry flush DNS noise only |
| `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | 0 | valid; PostHog telemetry flush DNS noise only |
| `git diff --check` | 0 | no output |

Secret scan:

```bash
rg -n "fake-key|ZHIPU_API|OPENAI_API|ANTHROPIC_API|Bearer|sk-" docs/verification/agent-runtime-v1/providers/2026-07-09-openai-compatible-formal-local.json docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json
```

Result: exit 1, no matches.

## 边界确认

- 未勾选 [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 的 3.1 / 3.2 / 3.5 / 3.6；复核输出仍为 `[ ]`。
- 未关闭 Gate C，未 promotion，未 archive，未 freeze。
- 未实施 ChatGPT OAuth。
- 未把 Anthropic 当 Gate C required；缺 key 不阻塞 OpenAI-compatible required family，也不 fake PASS。
- 未写入密钥到 report / evidence。
- 未扩展到 Frontend / Gate D / archive。
- 未执行 `git add` / commit / push / reset / clean。

## 注意事项

- 当前 worktree 仍含多处本批前已存在的未提交变更；本批只叠加 qualification harness、OpenAI fake matrix/test、formal local evidence 和本 report。
- `npx openspec validate` 返回 exit 0，但 CLI 在退出前尝试刷新 PostHog telemetry，受当前网络限制报 `edge.openspec.dev` DNS 错误；这不是 OpenSpec validation failure。

## 下一步建议

等待 Grok Review。Review 通过后，下一批可基于 formal production harness 重新跑 Zhipu/OpenAI-compatible production matrix；retry / terminal_error / cancellation 若仍无安全真实路径，应继续 `blocked` 并说明原因，不得 mock PASS。
