# Agent Definition Loader v0 Design

文档类型：架构设计确认记录  
日志及版本：v1 / 2026-06-18 / 用户确认采用推荐方案 JSON-first Loader

## 结论

通过：本轮选择 `Agent Definition Loader` 作为 P2 Agent Definition DSL + SDK 路线的最小可落地切片。

## 设计范围

- 新增 TS Runtime 本地 Agent Definition Loader。
- v0 只支持 `agent-runtime/agents/*.json`。
- Definition 字段：
  - `agentId`
  - `promptRef`，格式为 `promptId@version`
  - `tools`，工具名 allow-list
  - `model`，可选 metadata/hint
- 缺省行为：当定义目录不存在或为空时，使用默认 definition，保持现有 chat 行为。
- 失败策略：malformed JSON、schema invalid、duplicate `agentId` 均 fail closed。

## 非目标

- 不支持 YAML。
- 不新增 SDK。
- 不做 Frontend UI。
- 不做远程 CRUD API。
- 不做 hot reload。
- 不做 tenant-scoped dynamic definitions。
- 不改变 Java model router 行为。
- 不把 tool allow-list 扩展为 Java policy enforcement。

## 主要依据

- `PromptRegistry`、`ToolRegistry`、model routing metadata 已存在，Agent Definition 可以作为这些能力的声明式绑定层。
- JSON-first 可以避免新增依赖，降低 proposal 和实现风险。
- 默认 definition 能保证现有 API 和测试不被强制迁移。

## OpenSpec 产物

- `openspec/changes/add-agent-definition-loader/proposal.md`
- `openspec/changes/add-agent-definition-loader/design.md`
- `openspec/changes/add-agent-definition-loader/tasks.md`
- `openspec/changes/add-agent-definition-loader/specs/agent-definition/spec.md`

## 后续待办

- 待 OpenSpec proposal 通过后，生成 Superpowers implementation plan。
- 实施时必须 TDD：先写 schema/loader/runtime integration 测试，再实现。
