## 1. Spec Deltas 与设计审查
- [x] 1.1 编写 `agent-loop` 的增量需求，规定元工具 `invoke_skill` 拦截与延迟注入规则，规定主入口为 `AgentExecutionRunner`
- [x] 1.2 编写 `provider-adapter` 的增量需求，规定兼容能力声明与 TS 端匹配规则

## 2. 核心代码改造
- [x] 2.1 编写 `agent-runtime/src/skills/types.ts` 定义 `SkillMetadata`, `Skill`, `PendingInjection` 接口与 `ProviderMessageCapabilities` 结构
- [x] 2.2 编写 `agent-runtime/src/skills/loader.ts`，解析 `SKILL.md`，支持 YAML Frontmatter 元数据提取
- [x] 2.3 编写 `agent-runtime/src/skills/shredder.ts`，实现 best-effort 物理碎纸销毁算法
- [x] 2.4 修改 `agent-runtime/src/toolRegistry.ts`，在 `getFrozenCatalog` 返回时动态注入 `invoke_skill` 的元工具定义
- [x] 2.5 修改 `agent-runtime/src/agentExecutionRunner.ts` 与 `agent-runtime/src/agentLoop.ts`，在工具拦截环节处理 `invoke_skill` 调用与双消息延迟注入，支持 `beforeToolUse` 网关拦截审计，并基于当前 selected model 识别 Provider Capabilities
- [x] 2.6 在 `provider-adapter` 模块（或 TS 对应模块）实现模型前缀匹配以及 `AgentDefinition.metadata` 动态覆盖解析

## 3. 测试编写与执行
- [x] 3.1 编写 `skills/loader.test.ts` 单测验证 YAML metadata 提取与 Markdown 内容解析的准确性
- [x] 3.2 编写 `skills/shredder.test.ts` 单测验证 shredder 执行覆盖写与截断 unlink 的有效性
- [x] 3.3 在 `agentExecutionRunner.test.ts` 编写测试覆盖 `invoke_skill` 在 `AgentExecutionRunner` 下的拦截与延迟注入行为
- [x] 3.4 编写测试模拟延迟注入在不同 Provider capabilities（如 synthetic assistant 支持 vs 不支持）下的注入消息格式正确性
- [x] 3.5 运行 `pnpm --filter @openharness/agent-runtime test` 以保证所有单元测试通过
