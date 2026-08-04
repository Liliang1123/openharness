# OpenHarness Local CLI 试用闭环 Review

## 结论

有风险：用户本地 operator wrapper 已安装，`doctor → up → status → chat → logs → down` 已按顺序完成实测；生命周期管理正常，wrapper 的 chat 载荷编码和 HTTP 失败退出码缺陷也已局部修复并回归通过。但当前环境没有任何可用 provider 凭据，`chat` 最终返回空答案和 `MODEL_ERROR`；`logs runtime` 可以跟随日志文件，却无法用本次 conversation、trace 或 request 标识定位请求。因此本轮只达到 Local Trial 部分闭环，不得表述为 Production Verified。

## Review 范围

- 执行入口：[main-local-trial worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial)
- 交接依据：[2026-07-28-1053-openharness-local-cli-trial-next.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/2026-07-28-1053-openharness-local-cli-trial-next.md)
- wrapper 指南：[openharness-local-cli-wrapper.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)
- Runtime 收口依据：[2026-07-27-agent-runtime-local-trial-archive-closeout.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-27-agent-runtime-local-trial-archive-closeout.md)
- 用户命令入口：[openharness](file:///Users/elvis/.local/bin/openharness)
- 修复前备份：[openharness.before-chat-fix-20260728T114517+0800](file:///Users/elvis/.local/bin/openharness.before-chat-fix-20260728T114517+0800)
- 隔离源码：[source](file:///Users/elvis/.local/share/openharness/source)
- launchd 定义：[local.openharness.operator.plist](file:///Users/elvis/.local/share/openharness/local.openharness.operator.plist)
- Runtime gateway：[local-gateway.mjs](file:///Users/elvis/.local/libexec/openharness/local-gateway.mjs)
- 用户状态目录：[openharness state](file:///Users/elvis/.local/state/openharness)
- 日志目录：[logs](file:///Users/elvis/.local/state/openharness/logs)
- trial 数据库：[agent-runtime-trial.sqlite](file:///Users/elvis/.local/state/openharness/data/agent-runtime-trial.sqlite)

## OpenSpec Gate 0

- 变更类型：现有 Local Trial wrapper 的局部恢复，按 Direct Change 处理。
- 允许范围：用户本地 wrapper 的既有命令可用性、对应回归验证和本 review 证据。
- 禁止范围：Runtime 实现、正式 CLI 契约、安装升级契约、配置/凭据语义、用户可见 Runtime 行为、前端能力、OpenSpec 归档、合并、全仓回归和 24 小时 Gate。
- 当前 active OpenSpec change：无。
- 判定：本轮两行 wrapper 修复不需要新 proposal；若继续改变正式 CLI、配置/凭据、Runtime 日志或用户可见失败语义，必须先新建 OpenSpec proposal、验证并等待批准，批准后才能生成 Superpowers implementation plan。

## 六命令结果

| 顺序 | 命令 | 结果 | 验证证据 |
|---|---|---|---|
| 1 | `openharness doctor` | PASS | 依赖、版本、隔离源码和四端口检查通过；明确警告本地 `.env` 缺失；退出码 0。 |
| 2 | `openharness up` | PASS | launchd supervisor PID `60094`；backend、runtime、frontend readiness 均为 `pass`；退出码 0。 |
| 3 | `openharness status` | PASS | backend `8080`、runtime `3001`、frontend `5173` 均报告 `RUNNING`；退出码 0。 |
| 4 | `openharness chat "你好，请介绍一下当前 OpenHarness Runtime"` | FAIL | 请求被 Runtime 接收并生成 conversation、trace、request 标识，但答案为空、`stopReason=MODEL_ERROR`；数据库执行状态为 `errored`。 |
| 5 | `openharness logs runtime` | FAIL | 命令可进入持续跟随并能读取日志，但日志只有历史 `EADDRINUSE` 内容；检索本次 conversation、trace、request 均无结果，未满足本次请求可追踪验收。 |
| 6 | `openharness down` | PASS | launchd job 安全停止；退出码 0；随后 `status` 为 `STOPPED`，四端口均无监听。 |

汇总：`4 PASS / 2 FAIL`。

## 服务与端口

| 服务 | 端口 | `up/status` | `down` 后 |
|---|---:|---|---|
| Backend | `8080` | readiness pass | closed |
| Runtime gateway | `3001` | readiness pass | closed |
| Runtime internal | `3101` | 由 supervisor 管理 | closed |
| Frontend dev server | `5173` | readiness pass | closed |

本轮不开展前端能力开发；这里只验证既有本地栈的生命周期。

## 主要发现

### 高：当前环境无法完成有效模型回答

用户环境与隔离源码都没有可用 provider 凭据。正式 smoke 的 conversation 为 `conv-9de5987f-b4ae-4c34-889a-494d0f3f2aa0`，trace 为 `trace-2d6b8af3-0d06-435e-87ab-4387a0577f9f`，request 为 `req-abf75635-7e26-4e03-ac1e-878b79a7ef15`；API 返回 HTTP 200，但答案为空且 `stopReason=MODEL_ERROR`。只读数据库核验得到 execution `bbb9a0c0-516e-4009-afb0-17be6b429440`、状态 `errored`、事件包含 `agent_start`、`model_call_start` 和 `stream_error`。

### 中：Runtime 日志不具备本次请求定位证据

日志跟随命令本身可以工作，但 [runtime.log](file:///Users/elvis/.local/state/openharness/logs/runtime.log) 没有上述 conversation、trace 或 request 标识。本轮不修改 Runtime 日志行为；如要把“按请求标识可定位”变为正式能力，应走新 OpenSpec。

### 中：wrapper 原有 chat 载荷分隔符错误

修复前实现用 `split("\\0")` 解析 NUL 分隔输入，实际按反斜杠和数字零拆分，导致 message 丢失且 conversation ID 混入 NUL 与消息。修复为 `split("\u0000")` 后，回归脚本确认 message 与 conversation 均被完整保留，数据库写入 1 条对应记录。

### 中：wrapper 原有 chat 会吞掉 curl 非 2xx 退出码

修复前 curl 后的换行输出覆盖了 curl 状态。现在先保存 curl 状态，再输出换行并返回原状态。模拟 Runtime 返回 HTTP 500 的真实 wrapper 回归结果为 `PASS http_failure_returns_nonzero rc=22`。

### 低：试用期间存在并发本地 operator 操作

试用中观察到另一个执行上下文曾启动/更新同一用户本地 wrapper，造成一次残留 supervisor 和端口竞争。正式计分前已使用 wrapper 自身的 `down` 清理，并从干净端口状态重新执行六步 smoke。当前 `down` 后已再次确认所有相关端口关闭。

## 变更文件

本轮没有修改 OpenHarness Runtime、隔离源码、OpenSpec、dashboard 或项目规则。

- 已修改：[用户本地 openharness wrapper](file:///Users/elvis/.local/bin/openharness)
  - NUL 分隔符解析改为实际 NUL。
  - 保留并返回 curl 退出码。
- 已创建：[修复前 wrapper 备份](file:///Users/elvis/.local/bin/openharness.before-chat-fix-20260728T114517+0800)
- 已创建：[本 review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-28-openharness-local-cli-smoke-review.md)
- 临时诊断/回归制品：[wrapper regression](file:///private/tmp/openharness-wrapper-regression.sh)、[fake runtime](file:///private/tmp/openharness-fake-runtime.mjs)、[HTTP exit regression](file:///private/tmp/openharness-http-exit-regression.sh)

试用前已存在、但未由本轮创建或修改的安装制品包括 [隔离源码](file:///Users/elvis/.local/share/openharness/source)、[launchd 定义](file:///Users/elvis/.local/share/openharness/local.openharness.operator.plist) 和 [Runtime gateway](file:///Users/elvis/.local/libexec/openharness/local-gateway.mjs)。

## 验证记录

- wrapper shell 语法：PASS。
- 修复前定向回归：`payload_preserves_message_and_conversation` FAIL，`http_failure_returns_nonzero` FAIL。
- 修复后载荷回归：`PASS payload_preserves_message_and_conversation rc=0 rows=1`。
- 修复后 HTTP 500 回归：`PASS http_failure_returns_nonzero rc=22`。
- wrapper 当前 SHA-256：`e86ac49dbc5a18bdf1bb4edf12bbd5b0800ff08ee23f5f47c82f34dad180fe4d`。
- 修复前备份 SHA-256：`da46c90594f8d90085de8ab2d59c22809f17d25a8ab85580d8b062316c0ae637`。
- 隔离源码状态：`main...origin/main`，clean。
- 最终停止态：`STOPPED supervisor_pid=none state=stopped`；`8080`、`3001`、`3101`、`5173` 均无监听。

## 最终建议

1. 若只需继续既有 Local Trial，先由用户私下提供并配置一个项目已支持的 provider 凭据，再原样重跑 `doctor → up → status → chat → logs → down`；不要把密钥写入 review、handoff 或命令输出。
2. 若需要新增或正式化凭据管理、安装/升级、CLI 输出/退出语义、Runtime 可观测性，应新建 OpenSpec proposal 并等待批准。
3. 在 provider chat 和请求日志定位都通过前，保持结论为 Local Trial 部分通过，不进入前端开发，也不触发全仓回归、归档或 24 小时 Gate。

## 后续门禁

- 本轮局部 wrapper 修复：不需要新 OpenSpec，不需要 Superpowers implementation plan。
- 使用既有、已支持的 provider 环境变量完成一次私密配置并复测：若不改变契约，可作为环境补全继续执行。
- 新增凭据流程、正式 CLI 契约、安装升级能力、Runtime 日志/错误行为或前端能力：需要新 OpenSpec proposal；批准前不得生成或实施 Superpowers plan。
- 项目规则：未修改。
