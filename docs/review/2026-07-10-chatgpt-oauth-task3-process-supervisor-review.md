# ChatGPT/Codex OAuth Task 3 Process Supervisor Review

## 结论

通过。Task 3 生命周期切片已按 TDD 完成：新增了 `CodexProcessSupervisor`，并通过 focused lifecycle tests 验证了启动、ready、handshake timeout、crash/restart、graceful shutdown 与 orphan cleanup 行为；未引入 provider 调用或凭据读取。

## Review 范围

- [Task 3 plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)（`### Task 3`）
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [CodexProcessSupervisor.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java)
- [CodexProcessSupervisorTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/CodexProcessSupervisorTest.java)
- [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)

## 主要发现

### 风险：低

- `CodexProcessSupervisor` 当前实现采用线程内监控循环与可注入 `ProcessLauncher/ReadinessProbe/Sleeper`，覆盖了设计要求中的关键生命周期点；在 READY 后进程退出时会进入 `DEGRADED` 并按 `restartBackoff` 做有界重试，再超过 `maxRestarts` 后转 `UNAVAILABLE`，行为可控。
- 在 `stop()` 场景中通过 `terminate` 和 `join` 实现了进程关闭与 orphan 防护；`stop()` 期间会清理当前 tracked process 流并置为 `STOPPED`，不产生悬挂子进程。
- `ProviderConfig.endpoint()` 仍由 `CodexProcessSupervisor` 构造校验，维持本机边界（如 `stdio://`、`unix://` 或 loopback WS）；该边界与 Task 2 已验收的 endpoint 约束一致。

### 建议关注

- 当前 `isLocalEndpoint` 仅识别 `ws://localhost...`、`ws://127.0.0.1...`、`ws://[::1]...`，若未来需支持 `wss` 需按设计补齐测试与实现；当前行为不构成阻断。
- Task 5/4 的日志与 metrics 采样仍未加入，当前切片未承诺新增 structured logging 项目字段，仅在测试覆盖内记录状态与 pid/exit/rtt 计时。

## 验证记录

- `mvn -o -f backend/pom.xml -Dtest=CodexProcessSupervisorTest test`：6 tests, 0 failures.
- `mvn -o -f backend/pom.xml -Dtest=CodexProcessSupervisorTest,ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest test`：31 tests, 0 failures（2026-07-11 续跑复验）。
- `mvn -o -f backend/pom.xml -Dtest=ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest,ModelControllerTest test`（由 Task 2 回归）仍可用于回归不回退。
- `git diff --check`：pass。

## 最终建议

Task 3 这一步可关闭；建议下一步直接进入 Task 4，继续“app-server request conversion”红绿测试，但保持同一门禁：

- 不提前实现生产 Adapter；
- 不读取任何 OAuth 凭据文件；
- 不修改 Gate C/状态勾选。

## 后续门禁

- 不需要新 OpenSpec 提案，继续沿用 `add-chatgpt-oauth-auth`。
- 不关闭 Gate C。
- Task 4、Task 5 进入前仍需严格 TDD（RED→GREEN）与独立 review 落盘。
- Task 3 完整验收前建议补一次 `mvn -o -f backend/pom.xml -Dtest=CodexProcessSupervisorTest,ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest test` 与后续 `docs/project-dashboard` 同步核验（当前 change 未进入 dashboard）。
