# MCP Stable-Schema Broker Archive Closeout

## 结论

通过：`add-mcp-stable-schema-broker` 已归档为 `2026-07-15-add-mcp-stable-schema-broker`，正式 `mcp-tools` spec 已合入固定 `mcp_call` Broker、每服务虚拟 Skill、lazy/idle lifecycle、权限/凭据隔离和 Gate D nested qualification target binding 合同。本结论只关闭该 change，不启动或替代正式 24 小时 Gate D。

## Review 范围

- [archived proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-add-mcp-stable-schema-broker/proposal.md)
- [archived design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-add-mcp-stable-schema-broker/design.md)
- [archived tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-add-mcp-stable-schema-broker/tasks.md)
- [archived mcp-tools delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-add-mcp-stable-schema-broker/specs/mcp-tools/spec.md)
- [current mcp-tools spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/mcp-tools/spec.md)
- [implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-15-mcp-stable-schema-broker-implementation-review.md)
- [engineering invariants](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/engineering-invariants.md)
- [learning candidate](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/learning-candidates/2026-07-15-mcp-broker-security-boundaries.md)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Pass — archive 与正式 spec 更新成功

`npx openspec archive add-mcp-stable-schema-broker --yes` 成功应用 2 个 added requirements 和 3 个 modified requirements，并将 change 移入带日期 archive 目录。归档副本的 tasks 全部完成。

### Pass — security learning 已项目化

三轮实施 Review 发现的授权时序、child environment 与 nested approval target 问题已由确定性回归测试强制。归档前 Project Learning Closeout 更新了 MCP glossary，增加共享工程不变量和带 SHA-256 provenance 的 Candidate Card；独立 focused Review 最终 PASS。

### Fixed — Broker nested policy identity

归档后最终 Review 发现 Java policy 只匹配外层 `mcp_call` / `mcp:broker`，导致既有 nested tool/server `mcpAllowList` 语义失效，同时正式 spec 残留 direct-tool approval 场景。已通过 TDD 让 Java 从有效 envelope 派生 nested identity，用于 deny、Skill approval 和 allow-list；malformed envelope fail closed。正式及 archived `mcp-tools` / `policy-evaluate` 合同、glossary、runbook、dashboard 和 learning artifacts 已同步。

### Pass — 生产权限边界未扩大

本轮没有调用真实模型、读取或输出 OAuth/API-key 值、启动正式 Gate D、合并主分支或创建 production evidence。`harden-agent-runtime-single-node-production` 仍是独立 active change。

## 最终建议

1. Dashboard 将本 change 标记为 `archived`，OpenSpec 路径全部切换到 dated archive，并以本 closeout 为入口。
2. 使用项目要求的中文分段式 commit 精确暂存并推送当前已验证研发批次。
3. 正式 Gate D 继续独立申请 production-start authority；不得以本次 fixture 回归替代 24 小时证据。

## 后续门禁

| 门禁 | 结论 |
| --- | --- |
| 本 change archive | PASS |
| current mcp-tools spec merge | PASS |
| Project Learning Closeout | PASS |
| Dashboard archived sync | PASS |
| active Runtime Gate D | 未启动，保持独立授权 |
| Git commit / push | 用户已授权，待最终验证后执行 |
| worktree cleanup | 仅在 push 成功且 worktree clean 后执行 |
| 项目规则 | 已增加 `AGENTS.md` 到共享工程不变量的最小加载指针 |

## 验证记录

- 实施前 closeout：focused Runtime 10 files / 128 tests、workspace tests/typecheck、backend 201 tests、OpenSpec strict、dashboard 和敏感值扫描均 PASS。
- Learning Closeout：focused 3 files / 68 tests、Runtime typecheck、`git diff --check` PASS；独立 Review PASS。
- archive：成功更新正式 `mcp-tools` spec 并创建 dated archive。
- archive 后：OpenSpec 23/23 strict、dashboard render/check、workspace tests/typecheck、backend 208 tests、敏感值扫描和 Git hygiene 均已刷新通过；Broker policy 修复后的最终矩阵 exit 0。
