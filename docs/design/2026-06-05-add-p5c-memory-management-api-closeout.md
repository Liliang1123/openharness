# Memory Management API Closeout

文档类型：Closeout / Implementation Record  
日志及版本：2026-06-18 v1

## 结论

通过。`add-p5c-memory-management-api` 已经完整在本地实现、完成测试覆盖并确认可用。

## 背景

此前在 `P5a`/`P5b` 阶段，OpenHarness 已支持多租户隔离的长期记忆事实的底层文件持久化与基于 ContextBuilder 的在线挑选。然而，外部管理员、运维工具或者测试脚本无法通过任何网络端口或 API 显式维护、检索、新增或删除这些长期记忆事实。

为了补齐 Harness 控制面对长期记忆的工程可管可用性，本次变更引入了 TS Runtime 的 Memory Management API 契约：
1. 暴露 RESTful 接口 `/api/v1/memory/facts`，支持多租户头隔离检索、搜索、写入和删除；
2. 禁止客户端在请求 payload 中自定义多租户归属或时间戳，全部由网关和 `MemoryStore` 根据请求上下文安全代签，防范租户越权（IDOR）风险；
3. 本地全自动路由绑定，且绝不额外调用 Java 后端或触发不必要的 Agent Loop 交互。

## 核心逻辑

- **多租户隔离与 Header 提取**：
  - 所有 API 操作强制提取请求头 `X-Tenant-Id` 与 `X-User-Id` 作为租户/用户主键，隔离度与 `MessageHistory` 完全对齐。
- **CRUD 路由定义**：
  - `GET /api/v1/memory/facts`：返回属于当前租户的所有 Memory Facts。支持 literal `query` 模糊搜索和 comma-separated 的 `tags` 标签过滤。
  - `PUT /api/v1/memory/facts`：上传并插入新的 Memory Fact（根据 `memoryId` 决定是插入还是更新）。生成唯一的 `memoryId` 并在 Zod 层面拦截任何客户端强行指定的 tenantId/userId/createdAt 等越权字段。
  - `DELETE /api/v1/memory/facts/:memoryId`：根据 ID 物理删除长期记忆事实，若 ID 不属于当前租户则返回 `404 NOT FOUND`。

## 规格与计划

- OpenSpec archive：`openspec/changes/archive/2026-06-05-add-p5c-memory-management-api/`
- Current specs：
  - `openspec/specs/shared-schema/spec.md`
  - `openspec/specs/long-term-memory/spec.md`
- Superpowers implementation plan：`docs/superpowers/plans/2026-06-05-add-p5c-memory-management-api.md`
- Development dashboard：`docs/project-dashboard/development-log.json`

## 已完成范围

- **共享契约 (Zod)**：
  - [index.ts:L178](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts#L178) 增加了 `MemorySearchQuerySchema`、`MemoryUpsertRequestSchema` 等 Zod 校验规则，严格限制 payload 字段集。
- **HTTP 路由绑定**：
  - [server.ts:L301](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/server.ts#L301) 实现了 GET、PUT、DELETE `/api/v1/memory/facts` endpoint 逻辑。
- **单元测试覆盖**：
  - `packages/shared-schema/test/schema.test.ts` 验证契约。
  - `agent-runtime/test/memoryApi.test.ts` 验证 scope 隔离。

## 非目标

- 不支持大模型在 Agent Loop 执行期间自动抽取和向 `MemoryStore` 自主写入事实（事实均由 Operator/开发显式维护）。
- 不支持基于向量相似度的检索（当前管理面为精确 literal 与标签过滤）。

## TDD 与验证记录

### 单元测试与 TDD

- **契约校验测试**：
  - `pnpm --filter @openharness/shared-schema test` 通过，覆盖了 memory search 异常载荷、upsert 忽略越权字段的 parse 验证。
- **API 隔离与操作测试**：
  - `pnpm --filter @openharness/agent-runtime test -- memoryApi` 通过（5 tests）。
  - 测试用例 `scoped facts CRUD` 验证了列表展示、无感 upsert、ID 越权删除拦截、精确 tag 过滤及 404 返回；
  - 测试用例 `strict header schema validation` 验证了缺失 `x-tenant-id` 时拒绝返回。

### 全量测试

- `pnpm test` (250 tests passed)。
