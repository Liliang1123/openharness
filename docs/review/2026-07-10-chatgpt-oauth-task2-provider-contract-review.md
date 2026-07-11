# ChatGPT/Codex OAuth Task 2 Provider Contract Review

## 结论

通过。Task 2 已以 TDD 完成 `codex-app-server` 配置载体、显式 `openai-codex/<bare-model>` 路由、bare-model allow-list、本机 endpoint/参数约束、无凭据配置和 no-fallback 门禁；既有 Zhipu/OpenAI-compatible provider 行为保持兼容。生产 Codex Adapter、进程和 IPC 均未提前实现。

## Review 范围

- [Approved Task 2 plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)
- [ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java)
- [ProviderRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java)
- [ModelRouter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java)
- [ProviderPropertiesTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/ProviderPropertiesTest.java)
- [ProviderRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/ProviderRegistryTest.java)
- [ModelRouterTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/ModelRouterTest.java)

## 主要发现

### 已关闭：配置与传输边界

- Codex 配置新增 command、appServerArgs、endpoint；共享 baseUrl/apiKey 对 Codex 必须严格为 null。
- endpoint 仅接受 stdio、Unix socket 或无 userInfo/query/fragment 的 loopback WebSocket。
- appServerArgs 白名单仅接受 `app-server` 与唯一、匹配 endpoint 的 `--listen`；token/secret 文件参数被拒绝。

### 已关闭：路由与 fallback 边界

- 仅精确 `openai-codex/<bare-model>` route 可选择 Codex provider，suffix 必须在 bare-model allow-list。
- 缺 route、provider 类型错配、模型越权、普通模型指向 Codex 均 fail closed。
- Codex 不成为显式或隐式默认 provider，不写入 registry bare-model 索引，`openai-codex/*` 不能绕过 ModelRouter。
- 同名 API-key provider 的 bare model 仍可正常解析，旧 provider 的 lazy adapter 行为保持不变。

### Review 修复循环

独立 Review 共执行四轮。前三轮发现的 endpoint/args 绕过、credential 空白槽、隐式默认、缺精确 route、旧 provider 兼容、registry 旁路、credential-file 参数和 WebSocket query/fragment 均已按 RED → GREEN 修复；第四轮结论为 PASS，无剩余 actionable finding。

## 验证记录

- RED：focused tests 先观察到缺配置属性、缺 fail-closed、registry fallback 和安全边界断言失败。
- GREEN：`mvn -o -f backend/pom.xml -Dtest=ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest,ModelControllerTest test`，26 tests，0 failures。
- Backend regression：`mvn -o -f backend/pom.xml test`，67 tests，0 failures。
- OpenSpec：`npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`，change valid；PostHog 遥测网络告警不影响退出码与校验结论。
- Dashboard：重新渲染生成文件并运行 `pnpm dashboard:check`，结果通过；change 状态仍保持 proposed。
- Scope/format：`git diff --check` 通过；未触碰独立 Stage 0 worktree，未调用 Provider，未读取凭据。

## 最终建议

Task 2 可以关闭。下一切片进入 Task 3 时，先为进程启动、握手超时、ready/crash、restart backoff、graceful shutdown 和 orphan cleanup 写 RED lifecycle tests；不得把本切片 fake adapter 当作生产 Adapter。

## 后续门禁

- 现有 OpenSpec change 继续 active，无需新 proposal。
- Task 3 继续 strict TDD 与独立 Review。
- `needs_login` 新错误类型仅在真实 Adapter 状态无法由现有结构化错误表达时新增。
- 不调用真实 Provider、不关闭 Gate C、不归档 OpenSpec、不执行 git add/commit/push/reset/clean/freeze。
