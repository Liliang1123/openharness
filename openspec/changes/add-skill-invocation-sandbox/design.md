# Design: Skill Invocation Sandbox

## Context
传统的工具集成方案通常通过为每类特定操作在 Tools Schema 中注册繁多接口来应对各种技能，这会导致缓存前缀大面积抖动和失效。自进化技能使用通用的元工具 `invoke_skill` 配合脚本执行来实现技能自愈与沙箱隔离。这需要设计对应的 Skill 解析、加载、延迟注入以及敏感文件物理销毁机制。

## Goals / Non-Goals
- **Goals**:
  - 建立规范的 `SkillMetadata` 结构与标准兼容的技能解析器；
  - 实现双消息延迟注入（Deferred Injection）逻辑和 Alternating Roles 门禁适配，主路径统一为 `AgentExecutionRunner.ts`；
  - 解决 `invoke_skill` 模型可见性定义与 TS 自治的 `ProviderMessageCapabilities` 决策机制；
  - 实现 Best-effort Shredding 降风险物理销毁算法；
  - 保持 `beforeToolUse` 网关权限阻断对元工具的可审计性。
- **Non-Goals**:
  - 本 Change 暂不实现完整的 `invoke_subagent` 模型分发器（这属于后续 `add-subagent-dispatcher` 变更）；
  - 本 Change 暂不实现本地 Skill 运行时的动态热重载与本地反思自进化生成，仅通过 Mock 校验 patch 脚本生成逻辑。

## Decisions

### 1. 主入口对齐与双消息延迟注入
当 `AgentExecutionRunner.ts`（主入口）或 `agentLoop.ts` 拦截到 `invoke_skill` 元工具调用时：
1. 提取 Skill markdown 内容并放入待注入队列。
2. 向模型返回确认的 `tool_result` 消息（`Skill [name] instructions expanded. Please proceed.`），正常结束本轮工具交互。
3. 在下一轮模型迭代前的 observe 阶段，将队列中的内容渲染为配对的消息加入 History 中：
   * 消息 1：`{ role: "assistant", content: "[SYSTEM] Skill loaded:\n" + expandedContent, systemInjected: true }`
   * 消息 2：`{ role: "user", content: "[SYSTEM] The skill instructions above have been loaded. Please proceed to execute the task now.", systemInjected: true }`
4. **门禁退避**：对于不支持 synthetic assistant 注入的底层模型，则仅仅追加一条 `user` 角色消息，其内容包含完整的提示词包裹，不产生连续的 assistant-assistant 破坏。

### 2. 模型可见 `invoke_skill` 元工具定义
- 方案：TS 运行时的 `ToolRegistry.ts` 在 `getFrozenCatalog()` 组装返回 `CatalogResponse` 时，自动在 `mergedTools` 中追加 `invoke_skill` 的系统元工具定义：
  ```json
  {
    "name": "invoke_skill",
    "description": "Invoke an agent skill dynamically by loading its instructions and state.",
    "permission": "sensitive",
    "parameters": {
      "type": "object",
      "properties": {
        "skill_name": { "type": "string", "description": "The unique name of the skill to invoke." },
        "task": { "type": "string", "description": "Specific instruction or task payload for the skill." }
      },
      "required": ["skill_name", "task"]
    }
  }
  ```
  这样可以确保大模型端可见，且不需要更改 Java 端的 Catalog Schema。

### 3. TS 端自治的 Provider 兼容性门禁
- 方案：TS 端引入 `ProviderMessageCapabilities` 解析。
  - **内置默认映射**：对常见的 `claude-3` 等模型前缀默认开启 `supportsSyntheticAssistantInjection: true`。
  - **动态覆盖**：支持从 `AgentDefinition.metadata.providerCapabilities` 动态读取并覆盖当前模型的能力位配置。
  - **保守退避**：对未知或不声明能力的模型，默认采用 `supportsSyntheticAssistantInjection: false`，安全包裹在单条 `user` 消息信封中，确保不破坏 Alternating Roles。

### 4. 商业 Skill 强力 Shredding (Best-effort)
为降低敏感/商业 Skill 文件在卸载后的磁盘物理可恢复风险：
1. 用伪随机字节或全零字节对目标临时文件覆盖写入 3 次；
2. 强制同步刷新（`fs.fsyncSync`）；
3. 将文件大小截断为 0；
4. 调用 `fs.unlinkSync` 释放物理链接。
注：该行为属于 best-effort，在 SSD 或 APFS 等写时复制 COW 系统中可能无法 100% 抹除块残留，但已极大降低泄露概率。

### 5. 安全与权限审计
`invoke_skill` 的元工具调用在真实执行解密或注入前，必须被 `beforeToolUse` 网关进行前置审计。若网关返回 `POLICY_DENY`，则注入流程阻断并向模型返回错误提示。

## Risks / Trade-offs
- **大模型对 synthetic 消息的容错性**：部分 Provider 在接收到非用户原生产生的 assistant 消息时可能会报错，我们必须由 `ProviderMessageCapabilities` 做好适配，并在测试套件中编写契约测试以对齐真实的 Provider 行为。
