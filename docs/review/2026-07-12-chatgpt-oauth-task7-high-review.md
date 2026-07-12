# ChatGPT/Codex OAuth Task 7 High Review

## 结论

通过。Task 7 deterministic fake matrix 的 13 个协议/状态机 rows 全部 PASS，真实 OAuth required row保持 `blocked + needs_login`，报告整体保持 `blocked`；mock evidence未提升真实资格。可以进入 Task 8 显式授权门禁。

## Review 范围

- [Task 7 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task7-medium-brief.md)
- [Task 7 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task7-medium-brief-preflight-review.md)
- [Codex fake matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/qualification/CodexFakeProviderMatrix.java)
- [Matrix test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/qualification/CodexFakeProviderMatrixTest.java)
- [Immutable fake evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-fake.json)
- Task 4/5 implementation与全部相关 tests。

## 主要发现

无未关闭 High/Medium finding。

### Matrix coverage

矩阵直接使用 in-memory JSONL peer驱动真实 `CodexAppServerClient`，并使用真实 registry验证：handshake与provider fallback禁用、sync、stream delta聚合、reasoning、usage、pending response、sequential calls、cancel、approval timeout、identical replay/conflict、restart orphan、auth failure、malformed response。

报告行只含 redacted environment fingerprint、SHA-256 request hash、布尔/状态 observed与oracle；不含raw thread/turn/call/bridge、arguments、results、Authorization或OAuth-like值。

### Fake/real boundary

- 前13个 fake contract rows：PASS。
- `codex-real-oauth-login`：required、BLOCKED、observed `needs_login`。
- overall local report：BLOCKED；禁止使用 `local_verified` 或 `pass`。
- immutable report经现有 promoter进行写入前与round-trip后双重schema validation。

### RED→GREEN 与 fresh gates

- RED：missing `CodexFakeProviderMatrix`，focused testCompile exit 1。
- Matrix focused：1/1，全部14 rows断言与promoter validation通过。
- Fresh backend clean full：140/140。
- Agent Runtime full：64 files、317/317。
- Shared schema full：58/58。
- Root typecheck：shared schema、agent runtime、frontend全部 exit 0。
- OpenSpec strict：valid，exit 0；PostHog离线warning非门禁。
- `git diff --check`：无输出，exit 0。
- surefire reports与immutable JSON canary scan：无匹配，`rg` exit 1。

### 稳定 SHA-256

间隔三秒双采样一致：

- Matrix：`18459caf18c6c47fd406176ad0fbcdc9fa215295f78a1f9904739366992402ad`
- Matrix test：`40e602bb77ecc5a5b9105a1d14888ff30d46bdd2a9efb86fea5add01f1a8a65a`
- Immutable evidence：`7521db71bf8e3b5006ef208f5423d056834782fcd0b51651ef3a464b6fba15b5`
- Adapter：`f68042f62a968d74ab21983da6b45d066e9547c57b8ff5e0db2c2de67ed55198`
- Client：`afdd28a87a68050c7f988c9cdc069c6f8f08b228d7beeda1ab4c21aecdc53ad0`
- Supervisor：`8e060dda0d4827e7698ffcffbfc9005345d0dfc2d9bd38e1e3411f09808522cc`

## 最终建议

接受 Task 7。下一步只能先请求用户对真实本地 Codex OAuth/provider smoke的明确授权；授权请求不得要求、读取或展示token。未授权前保持Gate C、dashboard verified与archive关闭。

## 后续门禁

- Task 8需要显式人工授权。
- 授权后仅运行批准的local app-server smoke并生成redacted production evidence；无login/不支持时记录BLOCKED，不伪造PASS。
- 未修改项目规则、OpenSpec checkbox或dashboard，未执行Git写操作。
