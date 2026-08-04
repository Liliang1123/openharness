# Runtime Chat Lifecycle Logs Plan Preflight Review

## 结论

通过：实施计划完整覆盖已批准的 `add-runtime-chat-lifecycle-logs` proposal、design 与 4 个 spec scenarios；文件范围、TDD RED/GREEN、sync/stream 共享 runner wiring、隐私 canary、sink failure、用户本地备份/同步/回滚、真实六命令 smoke 与最终停止态均已明确。计划没有实现占位符，不授予 Git/归档/生产权限，可以进入实施；本 Preflight 只授权执行计划，不代表 implementation Review 或完成。

## Review 范围

- 已批准 Proposal：[proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/proposal.md)
- 已批准 Design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/design.md)
- Spec delta：[agent-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/specs/agent-runtime/spec.md)
- OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/tasks.md)
- 实施计划：[2026-07-28-add-runtime-chat-lifecycle-logs.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-28-add-runtime-chat-lifecycle-logs.md)
- 生产入口：[server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- 共享 runner：[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
- Stream adapter：[agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentStreamLoop.ts)
- 用户本地执行入口：[openharness](file:///Users/elvis/.local/bin/openharness)
- 用户本地隔离源码：[source](file:///Users/elvis/.local/share/openharness/source)

## 主要发现

### 通过：生产边界与单一职责

新文件只负责固定字段 JSON-lines 序列化和 sink failure 吞吐；server 只注入；runner 只在 admission/terminal 边界投影；stream adapter 只透传内部 logger。计划不启用 Fastify logging，也不增加第二套生命周期或持久化权威。

### 通过：TDD 与验收闭环

计划先证明模块不存在的 RED，再实现 serializer；随后分别增加 runner 和 server sync/stream RED/GREEN。正式验证包含 serializer、runner、terminal errors、stream、production persistence/lifecycle/startup 与 typecheck；最后用真实 Codex chat 和 Runtime 日志关联关闭原 `logs` FAIL。

### 通过：隐私与失败隔离

固定 allowlist 不 spread request、state、error、headers 或 metadata。测试明确放入 message、answer、prompt、tool、Authorization、tenant/user、OAuth 与 error canary，并要求全部不出现。sink throw 不得传播到 runner。

### 通过：同步与回滚

用户本地只同步四个生产 TypeScript 文件。三个既有文件先做带哈希备份，新文件记录原先 absent；`.env`、agent definition、Java/provider 文件、wrapper 和 OAuth storage 均不读取或修改。失败时只使用 wrapper-owned `down`，恢复备份并移走新增文件。

### 通过：授权边界

计划中的 Git 命令文本只出现在明确禁止事项与自检扫描模式中，没有可执行的 add/commit/push/reset/clean 步骤。计划不包含 archive、全仓回归、24 小时 Gate、Frontend 或 Production Verified 声明。

## 验证记录

- Plan placeholder/Git mutation scan：只有明确禁止行与扫描命令自身命中。
- Boundary scan：只有 Architecture、禁止范围、隐私说明和同步排除项中的预期命中。
- `openspec validate add-runtime-chat-lifecycle-logs --strict --no-interactive`：PASS，退出码 0。
- Dashboard render/check：PASS，38 entries。
- `git diff --check`：PASS。
- OpenSpec offline PostHog warning：非阻塞；strict validation 最终退出码为 0。

## 最终建议

按计划先完成 serializer、runner、server 三段 TDD，再做用户本地同步。任何测试、typecheck、隐私扫描或真实 smoke 失败都停留在当前 slice，先按 systematic debugging 查因，不得扩大到 API、数据库、Java、Frontend 或 wrapper 契约。

## 后续门禁

- Plan Preflight：PASS。
- 下一步：按 TDD 实施并运行定向验证。
- 实施后：必须进行独立 implementation Review；有 finding 则返回修复和复验。
- Review PASS 后：完成用户本地备份/同步、真实 `6/6` smoke、dashboard verified 与新鲜最终验证。
- OpenSpec：保持 active，不归档。
- 项目规则：未修改。
