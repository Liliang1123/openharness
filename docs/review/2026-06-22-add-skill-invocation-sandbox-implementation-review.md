# add-skill-invocation-sandbox Implementation Review

## 结论

需修改：本轮实现的 `pnpm --filter @openharness/agent-runtime test` 在非沙箱环境确实通过 39 files / 205 tests，OpenSpec 与 Dashboard 校验也通过；但正式 TypeScript 编译门禁失败，当前代码不可合并。另有安全与契约风险：`invoke_skill` 的 TS 注入未同步跨运行时 catalog/hash/policy 契约，OpenSpec tasks 与 Superpowers plan 仍未勾选却 Dashboard 标记 verified，shredder 缺少受控根目录与 symlink 防护，proposal 中的签名/加密/商业敏感能力也未落地。

## Review 范围

- 新增模块：
  - `agent-runtime/src/skills/types.ts`
  - `agent-runtime/src/skills/loader.ts`
  - `agent-runtime/src/skills/shredder.ts`
  - `agent-runtime/src/skills/capabilities.ts`
- 核心修改：
  - `agent-runtime/src/toolRegistry.ts`
  - `agent-runtime/src/agentExecutionRunner.ts`
  - `agent-runtime/src/agentLoop.ts`
- 测试：
  - `agent-runtime/test/skills/loader.test.ts`
  - `agent-runtime/test/skills/shredder.test.ts`
  - `agent-runtime/test/skills/providerMessageCapabilities.test.ts`
  - `agent-runtime/test/toolRegistryMerge.test.ts`
  - `agent-runtime/test/agentExecutionRunner.test.ts`
- OpenSpec / plan / dashboard：
  - `openspec/changes/add-skill-invocation-sandbox/**`
  - `docs/superpowers/plans/2026-06-22-add-skill-invocation-sandbox.md`
  - `docs/project-dashboard/development-log.json`
  - `docs/project-dashboard/development-log.md`
  - `docs/project-dashboard/index.html`

## 主要发现

### 🔴 bug: TypeScript typecheck 失败，代码不可合并

- `agent-runtime/src/agentExecutionRunner.ts:663`: `AgentDefinition` 类型没有 `metadata` 字段，`input.agentDefinition.metadata` 编译失败。
- `agent-runtime/src/toolRegistry.ts:51`: 注入的 `invoke_skill` `ToolDefinition` 缺少必填字段 `isReadOnly`, `isDestructive`, `requiresApproval`，强转仍被 TS 报错。
- 修复：要么在 `shared-schema` 的 `AgentDefinition` 增加 metadata 并补 schema/spec/test，要么不要读取不存在字段；补全 `ToolDefinition` 必填字段，避免错误强转。

### 🔴 security: `shredFile(filePath)` 缺少路径边界与 symlink 防护

- 位置：`agent-runtime/src/skills/shredder.ts:7-33`
- 问题：任意路径传入即 `stat/open/truncate/unlink`，没有限定 skill cache 根目录、没有 `lstat` 拒绝 symlink、没有普通文件检查。
- 影响：若上层参数被污染，可能删除工作区或用户目录任意文件；symlink/hardlink 场景也未定义。
- 修复：改为 `shredFile(rootDir, relativePath)` 或显式 root confinement；`realpath` 校验在 root 内；`lstat` 拒绝 symlink；只允许普通文件；失败写审计日志。

### 🔴 contract: `invoke_skill` 由 TS 动态追加为 catalog 工具，但跨运行时 catalog/hash/policy 契约不完整

- 位置：`agent-runtime/src/toolRegistry.ts:47-63`, `agent-runtime/src/agentExecutionRunner.ts:404-415`
- 问题：`invoke_skill` 被标为 source `catalog`，但 Java 原始 catalog 并不知道该工具，`catalogVersion/catalogHash` 也仍是 Java 返回值；`beforeToolUse` 交给 Java gateway 审计时，Java 可能按未知工具处理。
- 影响：测试 FakeJava 放行不代表真实 gateway 放行；catalogHash 也不包含 TS 注入工具，审计与模型可见 schema 不一致。
- 修复：定义 TS synthetic tool source（例如 `runtime:invoke_skill`），把合成工具纳入 hash 派生，或让 Java catalog 正式提供该元工具；补真实 policy evaluate contract 测试。

### 🔴 security/spec mismatch: proposal 声称签名/合规审计，但实现没有签名、license、encrypted 校验

- 位置：`openspec/changes/add-skill-invocation-sandbox/proposal.md:4,12,14`, `agent-runtime/src/skills/types.ts:13-15`, `agent-runtime/src/agentExecutionRunner.ts:508-529`
- 问题：实现只解析 `SKILL.md` 并注入 `skill.content`；`encrypted`, `brand_id`, `license_key` 只是字段，没有签名验证、授权验证、解密流程或失败分支。
- 修复：收窄 proposal，移除“签名/商业加密/合规审计”承诺；或实现签名与 license gate 并补测试。

### 🟡 risk: 默认生产路径会给 default-agent 暴露 `invoke_skill`

- 位置：`agent-runtime/src/toolRegistry.ts:47-49`, `agent-runtime/src/agentExecutionRunner.ts:291-303`
- 问题：非测试环境 `skillsEnabled = !isTest || ...`，即默认开启；default-agent 的空 tools 表示 full exposure，因此所有默认会话都能看到敏感 `invoke_skill`。
- 修复：建议默认关闭，用显式环境变量/AgentDefinition allow-list 启用；或要求 `requiresApproval: true` 并在 Java policy 侧有明确规则。

### 🟡 process: tasks 与 plan 未勾选，却 Dashboard 标记 verified

- `openspec/changes/add-skill-invocation-sandbox/tasks.md:1-18` 仍全部 `- [ ]`。
- `docs/superpowers/plans/2026-06-22-add-skill-invocation-sandbox.md:40-58` 仍全部 `- [ ]`。
- `docs/project-dashboard/development-log.json:12` 已标记 `verified`，与 checklist 事实不一致。
- 修复：完成后勾选 tasks 与 plan；若尚未完成，不应标记 verified。

### 🟡 spec mismatch: OpenSpec delta 仍写 `AgentLoop.run()` 场景

- 位置：`openspec/changes/add-skill-invocation-sandbox/specs/agent-loop/spec.md:17`, `specs/provider-adapter/spec.md:16`
- 问题：proposal/design 已强调主入口是 `AgentExecutionRunner`，但 spec scenario 仍以 `AgentLoop` 为验收对象。
- 修复：把 scenario 改为 `AgentExecutionRunner` 或 HTTP/SSE 主路径，`AgentLoop` 只作为兼容路径。

### 🔵 nit: 测试文件路径与 Dashboard 一致，但用户清单路径少了一层 `skills/`

- 实际文件：`agent-runtime/test/skills/providerMessageCapabilities.test.ts`
- 用户清单写法：`agent-runtime/test/providerMessageCapabilities.test.ts`
- 修复：后续交付清单按真实路径输出，避免 review/归档时找错文件。

## 验证记录

沙箱内运行：

```bash
pnpm --filter @openharness/agent-runtime test
```

结果：因 sandbox 端口限制，`abortApi.test.ts` 与 `detachedStream.test.ts` 出现 `listen EPERM: operation not permitted 127.0.0.1`；其余用例通过。

非沙箱授权后运行：

```bash
pnpm --filter @openharness/agent-runtime test
```

结果：通过。

```text
Test Files  39 passed (39)
Tests       205 passed (205)
```

继续运行：

```bash
pnpm --filter @openharness/agent-runtime typecheck
```

结果：失败。

```text
src/agentExecutionRunner.ts(663,87): error TS2339: Property 'metadata' does not exist on type ...
src/toolRegistry.ts(51,24): error TS2352 ... missing ... isReadOnly, isDestructive, requiresApproval
```

单独运行：

```bash
npx openspec validate add-skill-invocation-sandbox --strict --no-interactive
pnpm dashboard:check
```

结果：通过。

```text
Change 'add-skill-invocation-sandbox' is valid
✅ Dashboard generated outputs are current
```

## 最终建议

1. 先修复 typecheck 两个阻塞错误，补齐正式类型/schema 契约。
2. 收紧 `invoke_skill` 默认暴露策略与 Java policy/catalog/hash 契约。
3. 给 `shredFile` 增加 root confinement、symlink 拒绝和普通文件校验。
4. 同步 OpenSpec tasks、Superpowers plan 勾选状态；在 typecheck 未通过前不要标记 verified 或 archive。
5. 修正 OpenSpec scenario 主入口为 `AgentExecutionRunner`。

## 后续门禁

合并或归档前至少需要通过：

```bash
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
npx openspec validate add-skill-invocation-sandbox --strict --no-interactive
pnpm dashboard:check
```

当前状态：测试通过，但 typecheck 失败，因此不建议执行 `npx openspec archive add-skill-invocation-sandbox --yes`。
