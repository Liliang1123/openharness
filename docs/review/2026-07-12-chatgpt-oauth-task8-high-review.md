# ChatGPT OAuth Task 8 High Review

## 结论

通过。用户已明确授权的真实本地 Codex OAuth/app-server qualification 在
`codex-cli 0.144.1`、`gpt-5.4`、macOS aarch64、stdio-local 环境完成。六个 required
production rows 全部 PASS，报告 overall 为 `pass`；当前 evidence 直接绑定最终 client
与仓库外 probe SHA。Task 8 可以关闭，并进入 OpenSpec 23/23 对账与 final verification。

## Review 范围

- [Task 8 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task8-preflight-review.md)
- [approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [production evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json)
- [promotion audit](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/verification/agent-runtime-v1/providers/qualification-report-promotion-audit.jsonl)
- [CodexOAuthQualificationProbe.java](file:///tmp/CodexOAuthQualificationProbe.java)
- [official 0.144.1 generated schema](file:///tmp/openharness-codex-schema-01441/codex_app_server_protocol.schemas.json)

## 主要发现

### High：真实 reasoning schema 漂移已关闭

初始真实 matrix 的 sync、usage、stream、cancellation、redaction 已 PASS，但 reasoning
BLOCKED。method-only probe 与同版本官方 schema证明真实协议会产生 `reasoning`
completed item，且 reasoning summary 需要 turn-level `summary=auto`，复杂 reasoning
workload 才稳定产生 summary delta。实现按 RED→GREEN：

- turn/start 显式发送 `summary=auto` 与该模型默认支持的 `effort=medium`；
- 支持官方 `item/completed.params.item.type=reasoning` 的 `summary[]` fallback；
- 以 item id 去重 streamed delta 与 completed summary，同时保留同 turn 后续 reasoning
  item；
- identifier 仍限制 256，message/reasoning content delta 改为独立 65,536 总界限，
  不再误拒合法 300 字符 chunk。

观察到的有效 RED：

- completed reasoning fallback：focused 19 tests 中 1 error，exit 1；
- `effort=medium` 请求：focused 1 error，exit 1；
- per-item dedup：期望 `streamed + fallback`，实际只有 `streamed`，1 failure；
- bounded delta：300 字符合法 chunk 被转换为 `ErrorTurn`，1 error。

最终 client focused：21/21，exit 0。

### High：真实六行证据完整

最终 immutable production evidence：

- sync：terminal assistant 非空、no fallback、安全 thread settings、process cleanup；
- reasoning：真实 summary delta 与非空 reasoning，process cleanup；
- usage：input/output 为正、cached 非负且 integral；
- stream：真实 assistant delta 计数大于零且最终聚合非空；
- cancellation：一个 failed responder、一个 exact interrupt、structured cancelled、
  process cleanup；
- redaction：raw synthetic canary 未观察到、redaction marker 已观察到、terminal 与
  process cleanup。

六行均 `required=true`、`track=production`、`result=pass`，overall `pass`。每行绑定：

- client SHA-256：`08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc`
- probe SHA-256：`02701a4f0c2b9ed6b681db13642628d719fe8ea9d5e650f0f5f8d99559032249`

最终 evidence SHA-256：
`af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6`。

### Medium：失败证据与 overwrite 可追溯

首轮 sandbox 内执行因官方 Codex local database/path permission 被正确记录为 BLOCKED。
后续每次真实修正均使用 destination 当前 SHA、固定 reason、Java schema validation、
临时文件和 atomic move 覆盖；promotion audit 保存完整 old/new SHA chain。没有删除或
伪造历史失败结论。

### Medium：敏感信息与生命周期

- operator status 只输出固定五字段，登录状态为 ready；没有启动登录流程。
- probe 不读取 credential 文件、不请求/显示 OAuth token，不保存 JSONL frame、模型
  文本、thread/turn/call/bridge id 或 app-server stderr。
- evidence 与 audit 的 token/path/correlation canary scan 无匹配。
- 每行 `processCleaned=true`；进程审计排除既有 IDE-owned app-server 后，没有本轮
  qualification 遗留进程。

### Low：fresh verification

- backend full：149/149，exit 0。
- Runtime full：64 files、317/317，exit 0。
- shared schema full：58/58，exit 0。
- root typecheck：shared-schema、agent-runtime、frontend 全部 exit 0。
- Task 4.2 independent adversarial probe：7/7 PASS，exit 0。
- Task 8 plan critical Java set：9/9，exit 0。
- production evidence 由 shared `QualificationReportSchema` 直接解析：1/1 PASS。
- OpenSpec strict：valid，exit 0；PostHog offline warning 非门禁。
- dashboard check：generated outputs current，exit 0。
- `git diff --check`：无输出，exit 0。
- implementation/evidence/status 三秒双采样稳定，无并发漂移。

## 最终建议

关闭 Task 8。下一步逐条把 23 个 OpenSpec tasks 映射到实现、测试、Review 和真实
evidence；只有全部有强证据时才勾选。随后运行一次 final_critical、落盘 final Review、
把 dashboard 更新为 verified 并重新渲染；archive 后再次 strict validate 和 dashboard
check。不得把本次 OAuth 授权扩展到新 provider、凭据导出或发布操作。

## 后续门禁

- 不需要新增 OpenSpec proposal或 Superpowers plan；本轮属于已批准 Task 8。
- Task 8 PASS 不自动等于整个 change 完成；仍需 23/23 对账、final verification/Review、
  dashboard verified、archive。
- archive 不授权 git add/commit/push；本 Review 未执行这些 Git 写操作。
- 本 Review 未修改项目规则。
