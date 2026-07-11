# ChatGPT/Codex OAuth Task 6 Implementation Review

## 结论

通过。Task 6 的本地 Java command handler 已在独立 worktree 中完成 login/status/logout 委托、五字段 status 白名单、默认子进程输出丢弃、非就绪/未登录 fail-closed、focused tests 和运维文档。High Review 发现的 model-name/换行注入与伪 canary coverage 已通过同范围 TDD 修复；fresh focused、Backend full、OpenSpec strict、diff check、负向搜索和独立对抗探针均通过。该结论只签署 Task 6 command component，不开放 Task 5 ProviderAdapter、不代表真实 OAuth/Gate C 或整个 OpenSpec change 完成。

## Review 范围

- [Task 6 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6)
- [OAuth implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OAuth OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [Backend Gateway delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Provider Adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [CodexOperatorCommand.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6/backend/src/main/java/org/openharness/backend/service/provider/CodexOperatorCommand.java)
- [CodexOperatorCommandTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6/backend/src/test/java/org/openharness/backend/service/provider/CodexOperatorCommandTest.java)
- [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)
- [CodexProcessSupervisor.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java)
- [auth_contract.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6/docs/architecture/auth_contract.md)
- [dev_runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task6/docs/architecture/dev_runbook.md)

## 主要发现

### 已关闭：status 通过 model 名称注入额外字段

初始实现把配置中的 model 名称原样拼接到 `modelAvailability`，恶意或错误配置可包含 CR/LF、ANSI 或 token-like 文本，突破五字段输出边界。修正后只输出 `available|unavailable`；provider id 同时限制为安全字符集，focused test 与 High 独立探针均覆盖换行、ANSI、canary 和伪造字段。

### 已关闭：canary test 未进入生产进程边界

初始 fake invoker 只返回 exit code，synthetic output 从未进入 production invoker，不能证明真实默认路径不读取或转印输出。修正后默认进程逻辑通过可注入 launcher 测试：`ProcessBuilder` 的 stdout/stderr 均为 `DISCARD`，synthetic process 的 output/error stream 未被读取，OpenHarness output 只来自固定字段。

### 通过：命令委托与 fail-closed

- login 只构造 `codex login`；status 只构造 `codex login status`；logout 只构造 `codex logout`。
- 使用参数列表而非 shell evaluation；生产负向搜索无 `/bin/sh`、`Runtime.exec`、token/env 读取或 credential path。
- status 只有 provider id、readiness、process state、model availability、needs-login 五行。
- official status 非零、supervisor 非 READY 或 model allow-list 为空时返回 nonzero/unavailable，不触发 API-key 或 mock fallback。

### 非阻塞残余

- command handler 绑定同一 Gateway 进程中的 `ProviderConfig` 与 `CodexProcessSupervisor`；它不会发现或控制另一个 Gateway 进程。部署入口的最终 bean/launcher 组合需在后续整体 wiring 中复核，但不得借此提前实现 Task 5 ProviderAdapter。
- 任意 `codex login status` 非零目前保守映射为 `needsLogin=true`；这同时覆盖 CLI 不可用等失败，是 fail-closed 的信息收敛。
- 未运行真实 Codex login/status/logout；本 Review 只使用 fake process 与 synthetic output，符合当前授权边界。

## 验证记录

- 初始 Task 6 RED：`CodexOperatorCommand` 缺失导致预期 compile failure。
- High correction RED：缺失 `processInvoker(...)` production boundary 导致预期 compile failure。
- `mvn -o -f backend/pom.xml -Dtest=CodexOperatorCommandTest test`：8/8 PASS。
- `mvn -o -f backend/pom.xml test`：53/53 PASS，exit 0；在非沙箱环境运行以允许既有 loopback tests 和 Mockito attach。
- `DO_NOT_TRACK=1 npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：valid，exit 0。
- `git diff --check`：无输出，exit 0。
- 生产负向搜索：无 credential path、OAuth token field/env read、shell evaluation 或 verbatim output forwarding。
- High 独立 Java source-file probe：`HIGH_PROBE PASS lines=5 canary=false ansi=false badProviderAccepted=false`；临时 source 已删除，无 class 或仓库残留。
- Task 2/3 前置 hash：worktree 的 `ProviderConfig` 与 `CodexProcessSupervisor` SHA-256 均和主工作区对应实现一致。

## 最终建议

接受当前 diff 作为 Task 6 command component 的 High Review PASS。集成时应以本 worktree 的 Task 6 文件为源，保留 Task 2/3 相同前置实现；若后续 wiring 改变 command construction、supervisor binding、stdout/stderr、status 字段或 model/provider 输出规则，必须重新运行 focused test、full Backend、secret scan 和 High Review。

## 后续门禁

- 继续使用 active OpenSpec change `add-chatgpt-oauth-auth`；无需新增 proposal 或实施计划。
- 按用户边界不勾 OpenSpec checkbox、不同步 dashboard verified、不归档 change。
- Task 5 ProviderAdapter 仍未开放，不得在本 worktree实现。
- Task 4 由其他窗口持有，本 worktree 不得复制或修改 Task 4 partial diff。
- 真实 login/logout、真实 Provider smoke、credential 访问和 Gate C promotion 仍需单独明确授权。
- 未修改项目规则；未执行 git add、commit、push、reset 或 clean。
