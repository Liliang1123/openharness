# ChatGPT/Codex OAuth Task 5 High Review

## 结论

通过。Task 5 已在稳定 SHA 上接通 `openai-codex/*` ProviderAdapter、Spring registry/router、stdio managed session、frozen dynamic tools、exact pending registry lifetime 与结构化 non-fallback errors；API-key provider 回归保持不变。可以进入 Task 7 fake qualification matrix。

## Review 范围

- [Task 5 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task5-medium-brief.md)
- [Task 5 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task5-medium-brief-preflight-review.md)
- [Codex adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java)
- [Adapter tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerAdapterTest.java)
- [App-server client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Client tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Process supervisor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java)
- [Supervisor tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexProcessSupervisorTest.java)
- [Provider registry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java)
- [Model router](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java)
- [Model controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)

## 主要发现

### 已关闭 wiring finding

首轮 focused unit GREEN 后，真实 Spring context RED：Adapter 的 production/test-seam 双构造器未唯一标注，导致 `No default constructor found`，critical suite 10 context errors。production constructor 增加显式 `@Autowired` 后，context 与 controller/auth gates恢复 GREEN。

### 协议与生命周期

- `thread/start` 明确发送 `allowProviderModelFallback=false`、`sandbox=read-only`、`approvalPolicy=untrusted` 与 frozen function dynamic tool specs。
- Adapter 只接受显式 `openai-codex/` route并传递 bare allow-listed model；registry/router继续阻止 Codex 成为 default或被 ordinary model绕过。
- production 每个 initial call拥有独立 supervisor/client session；仅启用当前 JSONL client已验证的 `stdio://`，其他 local transport固定 unavailable。
- pending bridge持有同一 session并在 final/error/cancel/timeout/bridge failure后 exactly-once cleanup；supervisor先标记 stopping，再关闭 client/进程，避免 cleanup触发意外 restart。
- stderr由 daemon drain直接丢弃，不打印、不持久化，避免 pipe backpressure 与诊断泄漏。

### Error taxonomy 与安全

- `AUTH_FAILED` → `PROVIDER_NEEDS_LOGIN`；startup/transport/protocol不可用 → `PROVIDER_UNAVAILABLE`。
- 两类错误均为 fixed redacted message、`retryOwner=none`、`fallbackAllowed=false`，只含 provider/status metadata。
- ProviderConfig未新增 OAuth/token/credential字段；adapter/client/supervisor负向搜索无 credential、Authorization、policy/tool execution owner 或 silent fallback匹配。

### RED→GREEN 与 fresh evidence

- 初始 RED：missing adapter/dynamic tool API，focused compile exit 1。
- Spring wiring RED：critical context 10 errors；修复后 critical 78/78。
- Adapter/client/supervisor focused：29/29。
- Backend full：139/139。
- Root typecheck：shared schema、agent runtime、frontend全部 exit 0。
- OpenSpec strict：valid，exit 0；PostHog离线 warning非门禁。
- `git diff --check`：无输出，exit 0。
- 两组禁止 credential/fallback/tool-owner搜索：无匹配，`rg` exit 1。
- 独立临时 managed-session probe：1 test及关键 final/model/transcript/no-error/usage/cleanup断言 PASS；临时 source已删除。

### 稳定 SHA-256

间隔三秒双采样一致：

- Adapter：`f68042f62a968d74ab21983da6b45d066e9547c57b8ff5e0db2c2de67ed55198`
- Adapter test：`dafcf95189edef742129b35d0b0d04a193cd41ea710d605da20f59b0f28264ab`
- Client：`afdd28a87a68050c7f988c9cdc069c6f8f08b228d7beeda1ab4c21aecdc53ad0`
- Client test：`4025a98f912deb5418716c2807891e623e245c83343b49e0c5e54630245b97b8`
- Supervisor：`8e060dda0d4827e7698ffcffbfc9005345d0dfc2d9bd38e1e3411f09808522cc`
- Supervisor test：`dee879d46baada99c159aa73c7fb8e7985f52088e08af308945be2168c58fc33`
- Contracts：`de4c60a42d6d32770213b5bfe92e2f942331c414a08ef370e619c631e4a9dbf1`

## 最终建议

接受 Task 5 并进入 Task 7 deterministic fake app-server qualification。Task 7 必须把 adapter、actual JSONL client、pending continuation与TS bridge组合为可重复矩阵；fake PASS不得提升真实 OAuth Gate C。

## 后续门禁

- 不需要新增 OpenSpec proposal。
- Task 7 fake matrix与严格证据 Review PASS后，才请求 Task 8真实 OAuth显式授权。
- 未修改项目规则、OpenSpec checkbox或dashboard，未执行Git写操作。
