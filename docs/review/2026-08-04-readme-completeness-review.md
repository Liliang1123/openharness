# README 完整性 Review

## 结论

通过：英文 README 已补齐当前 Runtime、Gateway、Frontend、配置、API、SSE 重连、故障排查、安全边界和变更治理说明，并新增同等信息量的中文版本。文档明确区分“已实现/已测试”“实验性能力”“本地开发便利”和“生产资格验证”，没有把当前原型描述成生产产品。

## Review 范围

- [英文 README](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/README.md)
- [中文 README](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/README_CN.md)
- [环境变量模板](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/.env.example)
- [本地开发启动脚本](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/dev.sh)
- [Runtime HTTP/SSE 路由](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/agent-runtime/src/server.ts)
- [Runtime 请求/响应类型](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/agent-runtime/src/types.ts)
- [SSE detached runner 适配器](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/agent-runtime/src/agentStreamLoop.ts)
- [共享 Session Event 契约](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/packages/shared-schema/src/index.ts)
- [Backend 默认 Provider 配置](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/backend/src/main/resources/application.yml)
- [认证边界契约](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/docs/architecture/auth_contract.md)
- [本地开发/Provider runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/docs/architecture/dev_runbook.md)
- [本地 CLI wrapper 指南](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/docs/guides/openharness-local-cli-wrapper.md)

## 主要发现

### 已修复的问题

1. **语言入口缺失**：原 README 只有英文，没有语言切换或中文说明；现已新增 [README_CN.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/README_CN.md)，两份 README 顶部互相链接。
2. **运行时语义不完整**：原 README 只写了“可流式”和“可重连”，没有说明 detached execution、Durable Event ID、终态事件、Replay Gap、Abort、Approval、Timeout 和 Step Budget；现已补齐。
3. **API 面不完整**：原 README 只提供少量 Chat/Memory 示例；现已列出 Runtime 全部公开路由、请求响应结构、SSE 事件语义、Session 恢复/审批/中止，以及 Java 内部网关边界。
4. **配置与实际模板脱节**：原 README 未覆盖压缩、上下文预算、Prompt、超时、开发身份、集成测试地址等关键变量；现已按 [.env.example](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/.env.example) 补齐，并说明默认 zhipu 路由和 Codex 为显式配置。
5. **本地操作边界不清**：原 README 没有明确说明仓库不发布官方 `openharness` CLI；现已链接 wrapper 指南并说明其仅为本地运维便利，不是产品契约。
6. **安全与排障信息不足**：现已明确开发 Header 不是生产认证、Provider Key 只在 Java、Codex OAuth 不由 OpenHarness 读取、`localhost`/`127.0.0.1` CORS 差异、MCP 惰性生命周期、无写入工具能力和常见启动/Provider/回环监听问题。
7. **变更治理缺失**：现已在 README 中补充 Direct Change 与 OpenSpec 变更边界、[Dashboard 单一数据源](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/docs/project-dashboard/development-log.json)和生成产物校验规则。

### 仍需明确保留的风险

- OpenHarness 仍是早期 Runtime 原型，不应从 README 的“已测试”措辞推导出生产认证。
- 真实 Provider、Codex OAuth 和 Gate C/D 资格验证需要独立凭据、操作员授权和证据链，README 只能提供入口，不能替代资格报告或部署审批。
- 当前默认试用工具目录没有批准的工作区写入/编辑或 Skill 创建能力；README 已将其作为当前行为边界，而不是承诺中的功能。
- 本轮基线执行中 [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/agent-runtime/) 全套测试出现一次 detached stream 等待超时（`696 passed, 1 failed`）；随后对该测试文件连续三次最小化重跑均通过，判断为未复现的基线时序抖动。本次没有修改运行时代码，也没有把该现象包装成 README 变更已修复。

## 最终建议

- 将 [README.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/README.md) 作为英文入口，将 [README_CN.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/README_CN.md) 作为中文入口；后续新增用户可见能力时同步更新两份文档。
- Runtime/API/安全/持久化语义变化先更新 OpenSpec 和相应架构契约，再同步 README；不要把 README 当作未经批准的行为设计文档。
- 真实 Provider 或 Codex 说明只引用经过批准的 runbook/资格证据，不在 README 中写入密钥、Token、Provider 原始响应或未经验证的兼容性结论。
- 后续若要把本地 wrapper 发展为官方 CLI，应单独创建 OpenSpec change，定义发布、升级、认证和兼容性契约。

## 后续门禁

- **OpenSpec proposal**：本次为文档-only Direct Change，不新增 API、运行时语义、架构边界或安全策略，因此不需要新建 OpenSpec proposal。
- **Superpowers plan**：不需要实施计划；本次没有进入 [Superpowers plans 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/docs/superpowers/plans/)。
- **Dashboard sync**：本次没有修改 [Dashboard 数据源](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/docs/project-dashboard/development-log.json)，不触发 Dashboard proposed/verified/archived 同步点。
- **项目规则**：未修改 [项目规则](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/AGENTS.md)、[OpenSpec 规则](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/readme-cn/openspec/AGENTS.md)或 OpenSpec 治理约束。
- **验证**：已执行本地 README 链接目标检查、`git diff --check`、OpenSpec strict validate、Dashboard check、Java Backend 测试；Runtime 全套测试需保留上述一次未复现的时序抖动记录，并在后续 Runtime 变更中继续关注。
