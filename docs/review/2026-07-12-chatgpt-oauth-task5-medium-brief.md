# ChatGPT/Codex OAuth Task 5 Medium Brief

## 状态

已授权执行。Task 4 slice 已通过 [Task 4.6 Security Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-6-security-review.md)。本切片只接通 `openai-codex/*` ProviderAdapter/routing，不读取 credential、不执行 login、不调用真实 Provider。

## 允许修改

- 新增 [CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java)
- 新增 [CodexAppServerAdapterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerAdapterTest.java)
- 最小修改 [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java) 以传递 frozen dynamic tool specs 与显式 `allowProviderModelFallback=false`。
- 最小修改 [CodexProcessSupervisor.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java) 以在 READY stdio session 上创建唯一 client。
- 最小回归修改 [ProviderRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java)、[ModelRouterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/ModelRouterTest.java)、[ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)。

禁止修改 ProviderConfig 增加 token 字段、TS tool owner、OpenSpec、checkbox、dashboard、项目规则。

## 锁定设计

1. Adapter 是 `codex-app-server` 唯一 ProviderAdapter；接收 singleton pending registry 与可注入 managed-session factory。
2. production factory 每个初始 model call 启动一个 bounded supervisor/session；仅支持已验证 JSONL stdio transport。非 stdio local endpoint返回固定 unavailable，不尝试远程或 fallback。
3. client `thread/start` 显式发送 `allowProviderModelFallback=false` 与 request frozen tools 的 function dynamic specs；旧两参数 API 保持回归兼容。
4. Adapter 将请求消息序列化为 bounded role/content transcript；不把 OAuth/profile/token字段引入 config/domain。
5. final/pending/error 分别映射现有 `ModelChatResponse`。pending 使用 exact identity 注册 registry，并由 managed bridge 持有 session；final/error/cancel/timeout 后关闭 client 与 supervisor。
6. `AUTH_FAILED` 映射 `PROVIDER_NEEDS_LOGIN`；transport/start/unavailable 映射 `PROVIDER_UNAVAILABLE`。两者 `fallbackAllowed=false`、`retryOwner=none`，错误文本固定脱敏。
7. existing api-key provider registry/router/controller byte behavior保持；Codex 不成为 default，也不允许 bare model route。

## TDD 与门禁

- RED：missing adapter，ready final、pending、needs-login、unavailable、no fallback、dynamic tools、session close、API-key unchanged。
- GREEN：adapter focused；router/controller/client/supervisor/registry critical；backend full。
- OpenSpec strict、`git diff --check`、禁止 token/config/fallback/Java tool-owner搜索、独立 fake session probe、SHA/status 双采样。

## 后续门禁

Task 5 High Review PASS 后才进入 Task 7；Task 6 不在用户指定序列内，且任何 operator login/status/logout 与真实 OAuth 均不得在本切片执行。
