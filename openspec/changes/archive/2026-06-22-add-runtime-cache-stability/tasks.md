## 1. Spec Deltas 与设计审查
- [x] 1.1 编写 `cache-hints` 增量需求
- [x] 1.2 编写 `context-builder` 增量需求
- [x] 1.3 编写 `prompt-registry` 增量需求
- [x] 1.4 编写 `agent-runtime` 关于 Tools 锁定的增量需求

## 2. 核心代码改造
- [x] 2.1 重构 `cacheHints.ts`，引入 `cacheStrategy` 支持（`off`、`single`、`double`、`adaptive`），实现滚动双缓冲计算
- [x] 2.2 重构 `prompts/registry.ts` 和 `contextBuilder.ts`，彻底冻结 System Prompt 并不做任何动态拼接
- [x] 2.3 在 `agentLoop.ts` 挂载 `[session context]` 动态注入逻辑，定义在 System Prompt 追加后的注入时机
- [x] 2.4 修改 `toolRegistry.ts` 以支持 Session 生命周期的 Tools Schema 冻结锁定，但在 beforeToolUse 执行时仍然保持权限撤销的动态合规

## 3. 测试编写与执行
- [x] 3.1 在 `agent-runtime/test/` 新建或在已有测试中覆盖滚动双缓冲标记和策略决策（验证 `adaptive` 下断点行为）
- [x] 3.2 验证 System Prompt 静止与 `[session context]` 注入正确交替并去除 internal 字段
- [x] 3.3 编写 Contract 测试覆盖大模型提供商的 alternating roles 配对限制
- [x] 3.4 运行 `pnpm --filter @openharness/agent-runtime test` 以保证 100% 测试通过

