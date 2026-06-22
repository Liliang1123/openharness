# Proposal: Add Skill Invocation Sandbox

## Why
在大语言模型（LLM）与技能系统交互时，我们需要支持“自进化 Skill 执行引擎”和“延迟注入”，从而保证在不需要频繁变更/膨胀全局 Tools Schema 的前提下，使模型能够高效、安全地使用各类定制技能（如 PDF、Excel 处理等）。同时，商业技能具备加密混淆，以及在卸载/清理时（shredding）需要有最佳努力（best-effort）降低物理磁盘残留风险的机制，并在执行前引入权限和合规审计。

## What Changes
- **主入口统一对齐**：本 Change 以服务实际主路径 `AgentExecutionRunner.ts` 作为核心入口实施 Skill 延迟注入与拦截控制，`AgentLoop.ts` 保持同步适配。
- **自进化 Skill 引擎基础类型定义**：在 `agent-runtime` 引入 `SkillMetadata`、`Skill` 与 `PendingInjection` 接口，用以表达技能属性（如 fork_agent、是否加密等）。
- **Skill.md 兼容性解析器**：实现 `parseSkillMarkdown` 解析模块，支持提取 YAML Frontmatter 元数据和 Markdown 执行步骤主体。
- **模型可见 `invoke_skill` 元工具定义**：在 TS 运行时的 `ToolRegistry` 中动态追加 `invoke_skill` 的系统元工具定义，确保其始终在模型可见的 Tools Schema 中，无需依赖 Java 端硬编码。
- **延迟注入机制 (Deferred Injection)**：在 `AgentExecutionRunner.ts` 拦截 `invoke_skill` 并在 `tool_result` 之后，将技能内容以合成 `assistant` 与 `user` 双消息配对的形式注入历史。
- **TS 端自治的 Provider 兼容性门禁**：在 TS 的 provider adapter 模块中增加 `ProviderMessageCapabilities` 结构。通过基于模型名称（如 Claude 系列前缀）的内置匹配映射及 `AgentDefinition.metadata` 动态覆盖，支持 TS 运行时独立决策。对于不支持或未知的模型，退避采用单个 `user` 消息包裹（带系统 tag Envelope）进行延迟注入，规避 Alternating Roles 报错风险。
- **商业技能防泄漏与最佳努力碎纸机销毁 (Best-effort Shredding)**：对敏感或商业 Skill，在卸载/清理时采用零字节复写、截断与 unlink 文件结合的 best-effort 物理覆写方式，降低物理磁盘残留风险。
- **安全与权限审计 gate**：元工具 `invoke_skill` 的执行前必须调用 `beforeToolUse` 权限与签名合规性审计。

## Impact
- Affected specs: `agent-loop`, `provider-adapter`
- Affected code: `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/agentLoop.ts`, `agent-runtime/src/skills/` (新目录), `agent-runtime/src/provider-adapter/`, `agent-runtime/src/toolRegistry.ts`
