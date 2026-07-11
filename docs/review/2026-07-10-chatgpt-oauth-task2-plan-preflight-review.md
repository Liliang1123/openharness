# ChatGPT/Codex OAuth Task 2 Plan Preflight Review

## 结论

通过。Task 2 当前计划已覆盖配置载体、显式路由、bare-model allow-list、远程 endpoint fail-closed、fake adapter 边界、精确 RED/GREEN 命令、工作区隔离与回滚/停止条件，可以进入 TDD RED。

## Review 范围

- [Task 2 implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Provider adapter delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Backend gateway delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java)
- [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)
- [ProviderRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java)
- [ModelRouter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java)

## 主要发现

1. 初版计划遗漏 `ProviderConfig.java`，导致 command/args/endpoint 无法传给后续 Adapter；现已纳入 Task 2 文件范围。
2. 初版 Task 2 要求注册生产 Adapter，与 Task 5 冲突；现已明确 Task 2 仅使用 fake adapter 验证类型和路由，生产 Bean 保留至 Task 5。
3. 路由模型语义已闭合：外部 route id 为 `openai-codex/<bare-model>`，provider allow-list 保存 bare model；缺少显式 route、目标 provider 类型不匹配或模型不在 allow-list 时均 fail closed。
4. RED、GREEN/回归、OpenSpec strict validation 和 diff check 命令均已精确列出。
5. 当前根目录存在无关 dirty files，但 Task 2 指定的生产与测试文件无重叠修改；计划已绑定根目录并禁止触碰独立 Stage 0 worktree。

## 最终建议

按计划先运行现有 ModelRouter/ModelController 基线，再新增 `ProviderPropertiesTest`、`ProviderRegistryTest` 和 ModelRouter RED cases。生产实现只满足本切片测试，不提前实现进程、IPC 或真实 Codex Adapter。

## 后续门禁

- OpenSpec 已批准，无需新 proposal。
- Task 2 必须完整执行 RED → GREEN → focused regression → strict Review。
- 不读取凭据、不调用 Provider、不修改 Stage 0 Gate C 或无关任务。
- 不执行 git add、commit、push、reset、clean、archive 或 freeze。
