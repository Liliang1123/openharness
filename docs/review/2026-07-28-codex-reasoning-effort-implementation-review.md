# Codex Reasoning Effort 配置实施 Review

## 结论

有风险：已批准的 `add-codex-reasoning-effort-config` 实现通过定向 TDD、协议帧断言、用户本地配置绑定和真实 `gpt-5.6-sol/high` chat 验证；Codex OAuth 仍由 CLI 独占，未读取、复制或打印凭据，失败路径保持结构化脱敏且禁止 fallback。Local CLI 六步 smoke 为 `5 PASS / 1 FAIL`：`logs` 能跟随日志文件，但当前 conversation、request、trace 标识均未进入 wrapper 日志。因此 reasoning-effort change 可标记为本地 verified，整个 CLI 试用仍只部分闭环，不得声称 Production Verified。

## Review 范围

- OpenSpec proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/proposal.md)
- OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/design.md)
- OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/tasks.md)
- Spec delta：[provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/specs/provider-adapter/spec.md)
- 实施计划：[2026-07-28-add-codex-reasoning-effort-config.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-28-add-codex-reasoning-effort-config.md)
- 配置实现：[ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java)、[ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)
- 协议实现：[CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java)、[CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- 定向测试：[ProviderPropertiesTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/ProviderPropertiesTest.java)、[CodexAppServerAdapterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerAdapterTest.java)、[CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- Wrapper 指南：[openharness-local-cli-wrapper.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)
- 用户命令入口：[openharness](file:///Users/elvis/.local/bin/openharness)
- 用户本地隔离源码：[source](file:///Users/elvis/.local/share/openharness/source)
- 用户本地备份：[20260728T141754+0800-codex-reasoning-effort](file:///Users/elvis/.local/state/openharness/backups/20260728T141754+0800-codex-reasoning-effort)
- 日志目录：[logs](file:///Users/elvis/.local/state/openharness/logs)

## 六命令结果

| 顺序 | 命令 | 结果 | 证据 |
|---|---|---|---|
| 1 | `openharness doctor` | PASS | 工具链、隔离源码、本地配置和空闲端口检查通过。 |
| 2 | `openharness up` | PASS | supervisor PID `3969`；Backend、Runtime gateway、Frontend readiness 均通过。 |
| 3 | `openharness status` | PASS | Backend `8080`、Runtime gateway `3001`、Frontend `5173` 报告 RUNNING；内部 Runtime `3101` 由 supervisor 管理。 |
| 4 | `openharness chat` | PASS | conversation `codex-high-final-20260728t1434`；trace `trace-0a696cb9-2259-4d9c-b423-f0928d0e6517`；request `req-b95d6d56-9e91-4564-9465-5759dbd69ed0`；回答包含 `OPENHARNESS_CODEX_HIGH_FINAL_OK`，`stopReason=FINAL_ANSWER`。 |
| 5 | `openharness logs all` | FAIL | 命令可跟随三份 wrapper 日志；精确检索本次 conversation/request/trace 为 0 命中，不满足请求可定位验收。 |
| 6 | `openharness down` | PASS | wrapper 安全停止 launchd job；随后 `status` 为 STOPPED，四个端口均无监听。 |

汇总：`5 PASS / 1 FAIL`。

## 服务、端口与日志

| 服务 | 端口 | smoke 期间 | `down` 后 |
|---|---:|---|---|
| Backend | `8080` | ready | closed |
| Runtime gateway | `3001` | ready | closed |
| Runtime internal | `3101` | supervisor 管理 | closed |
| Frontend dev server | `5173` | ready | closed |

- Backend 日志：[backend.log](file:///Users/elvis/.local/state/openharness/logs/backend.log)
- Runtime 日志：[runtime.log](file:///Users/elvis/.local/state/openharness/logs/runtime.log)
- Frontend 日志：[frontend.log](file:///Users/elvis/.local/state/openharness/logs/frontend.log)

本轮未开发前端；Frontend 端口只作为既有本地栈生命周期证据。

## 主要发现

### 已验证：配置契约与兼容默认值

Codex provider 新增可选 `reasoning-effort`。缺省或空白值归一为 `medium`；显式值必须匹配 `[a-z][a-z0-9_-]{0,31}`；非 Codex provider 使用非空值会在注册前失败。旧构造器和旧 client overload 继续产生 `medium`，避免无配置调用者行为漂移。

### 已验证：协议只在 `turn/start.effort` 传递

Adapter 从冻结的 `ProviderConfig` 取 effective value，client 只把它写入 JSON-RPC `turn/start.effort`。它未进入命令参数、endpoint、base URL、API key、TS Runtime 请求 schema 或 Frontend。

### 已验证：OAuth 边界与无 fallback

本地验证只执行 `codex login status` 并观察“Logged in using ChatGPT”，没有读取登录存储。语义不支持场景继续映射为脱敏 `PROVIDER_UNAVAILABLE`，`fallbackAllowed=false`、`retryOwner=none`，测试 canary 不出现在响应中。

### 已修正：用户本地完整 provider 列表

首次 Codex-only `SPRING_APPLICATION_JSON` 会替换 YAML provider 列表，使既有默认 provider 不可用。最终本地配置保留 4 个既有 provider、默认 `zhipu`，另将 `openai-codex/gpt-5.6-sol` 路由到 `openai-codex` 且 effort 为 `high`；未读取或输出任何真实 API key。

### 已修正：隔离源码启动的签名耦合

Wrapper 的 `mvn spring-boot:run` 会先编译测试。四个生产文件同步后，旧 `CodexAppServerAdapterTest` 因 managed-session 新签名导致启动前编译失败。计划与 preflight 已修订，备份并仅同步这一签名耦合测试；隔离源码定向 adapter 测试随后通过。

### 残余风险：当前请求无法在 wrapper 日志定位

真实 chat 成功且 trace events 完整，但三份 wrapper 日志都不包含本次 conversation、request 或 trace 标识。修复它会改变 Runtime 或用户可见日志行为，超出当前 proposal；必须单独走 OpenSpec Gate，不在本实施中扩大范围。

## 用户本地变更与回滚

- 已同步到 [用户本地隔离源码](file:///Users/elvis/.local/share/openharness/source) 的四个生产 Java 文件与一个签名耦合 adapter 测试。
- 已创建忽略提交的本地配置 [.env](file:///Users/elvis/.local/share/openharness/source/.env) 和 [default-agent.json](file:///Users/elvis/.local/share/openharness/source/agent-runtime/agents/default-agent.json)，权限均为 `0600`。
- 备份清单：[manifest.txt](file:///Users/elvis/.local/state/openharness/backups/20260728T141754+0800-codex-reasoning-effort/manifest.txt)，权限 `0600`；五个备份文件哈希逐项核对通过。
- Wrapper SHA-256 为 `e86ac49dbc5a18bdf1bb4edf12bbd5b0800ff08ee23f5f47c82f34dad180fe4d`。
- 回滚时先执行 `openharness down`，按 manifest 恢复备份文件与原配置，再执行 `openharness doctor`；不得触碰 Codex 登录存储。

## 验证记录

- 配置 RED：缺少 setter/accessor，6 个预期编译错误，退出码 1。
- 配置 GREEN：`ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest` 共 29 项通过。
- 协议 RED：缺少 explicit-effort / managed-session 签名，2 个预期编译错误，退出码 1。
- 协议 GREEN：7 个定向测试类共 71 项通过。
- 隔离源码 adapter 测试：5 项通过。
- 用户本地绑定探针：4 个 provider、默认 `zhipu`、Codex model `gpt-5.6-sol`、effort `high`。
- Codex CLI：`0.145.0`，登录状态为 ChatGPT；未查看凭据文件。
- 真实 chat：目标固定响应命中，`FINAL_ANSWER`。
- 日志关联：本次三个标识 0 命中，故 `logs` 判 FAIL。
- 最终停止态：`STOPPED supervisor_pid=none state=stopped`；`8080`、`3001`、`3101`、`5173` 均无监听。

## 最终建议

1. 保留当前 provider-scoped reasoning-effort 实现为本地 verified，等待用户另行决定是否归档；本轮不归档、不合并、不提交。
2. 日常使用可继续依赖成功 chat，但暂时不要把 `logs` 当作按请求 trace 定位的证据。
3. 如要让 `logs` 可按 conversation/request/trace 关联，创建独立 OpenSpec proposal，批准后再生成新的 Superpowers implementation plan。

## 后续门禁

- 当前 `add-codex-reasoning-effort-config`：已批准并实施，仍为 active change；本轮禁止归档。
- reasoning-effort 当前范围：不需要新 OpenSpec。
- Runtime / wrapper 请求日志可观测性修复：需要新 OpenSpec proposal。
- Frontend、正式 CLI 安装升级、凭据管理或 Runtime 用户可见行为：需要各自的 OpenSpec 审批。
- 项目规则：未修改。
