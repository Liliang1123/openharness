# Agent Runtime Archive, Merge, And Local CLI Plan Review

## 结论

通过：计划严格收口于用户批准的 `Local Trial Ready`，明确保留正式 Gate D 为未来独立生产资格门禁，并对脏主工作区、19GB 生成型验证数据、精确暂存、`main` 集成和 worktree 清理设置了可验证边界。

## Review 范围

- [归档、合并与 CLI 交接计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-archive-merge-local-cli.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [开发看板数据源](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/development-log.json)
- [本地主工作区](file:///Users/elvis/file/develop/opensource/openharness)
- [Agent Runtime 功能 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion)

## 主要发现

- 高：正式 24 小时 Gate D 未执行；归档只能代表批准的本地试用范围收口，不能升级为 `Production Verified`。
- 高：主工作区存在用户所有的未跟踪文件；直接切换分支、清理或删除会造成数据风险。
- 中：性能恢复目录包含约 19GB SQLite/WAL/log 生成物；全部提交会污染仓库并显著放大 Git 历史。
- 中：仓库当前没有可安装的正式 `openharness` 产品 CLI；只能交付基于现有服务的本地操作封装方案。
- 低：`main` 是功能分支祖先，可在隔离 worktree 中 fast-forward，避免额外 merge commit。

## 最终建议

- 先完成 Project Learning Closeout、任务语义收口、看板 `verified` 同步和全量验证，再归档。
- 仅提交报告、脚本、配置、Review 和实现；忽略 SQLite/WAL/log。
- 在隔离 worktree 更新 `main`，不触碰脏主工作区。
- Codex 安装提示词应从本地合并后的 `main` 创建独立 source clone，并安装用户级 wrapper；不要改写为“官方 CLI 已交付”。

## 后续门禁

- 当前计划已获用户明确批准，可执行。
- 正式 Gate D、生产资格和产品级 CLI 均需未来独立 OpenSpec change。
- 合并前后均需执行计划列出的测试与验证；不再执行 24 小时 Gate D。
