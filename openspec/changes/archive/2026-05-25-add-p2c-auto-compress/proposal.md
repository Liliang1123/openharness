# Proposal: add-p2c-auto-compress

## Summary

Agent loop 在每次 final answer 后自动检查 token 阈值并触发压缩，补全 P1b 的最后一环。

## Motivation

P1b 实现了 `shouldCompress` 和 `compress` 函数，但 agentLoop / agentStreamLoop 没有自动调用它们。当前压缩只能通过外部手动触发。长对话会无限增长 history，导致 token 浪费和 context window 溢出。

## Scope

- **In scope**: agentLoop 和 agentStreamLoop 在 save 前自动检查并压缩；配置开关；错误容忍
- **Out of scope**: 压缩策略优化、前端压缩状态展示、chunk 浏览 UI

## Design Decisions

1. 压缩在 response 发出前执行（保证 save 的是压缩后的 history）
2. 压缩失败不阻塞响应（catch + log warning）
3. 环境变量 `COMPRESSION_AUTO=true|false`（默认 true）控制开关
4. 使用已有的 `shouldCompress` + `compress` 函数，不引入新依赖

## Impact

- **Files modified**: `agentLoop.ts`, `agentStreamLoop.ts`
- **New files**: none
- **Breaking changes**: none
- **Risk**: low — 压缩失败被 catch，不影响现有功能
