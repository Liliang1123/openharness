# ChatGPT/Codex OAuth Task 7 Medium Brief

## 状态

已授权执行。Task 5 已通过 [High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task5-high-review.md)。本切片只生成 deterministic fake contract evidence；任何真实 OAuth row必须保持 BLOCKED。

## 范围

- 新增 [Codex fake matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/qualification/CodexFakeProviderMatrix.java)
- 新增 [Matrix test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/qualification/CodexFakeProviderMatrixTest.java)
- 新增 immutable blocked evidence [Codex fake report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-fake.json)

## 锁定门禁

矩阵直接驱动 JSONL client 与 registry，覆盖 handshake/no-fallback、sync、stream、reasoning、usage、pending、sequential、cancel、approval timeout、replay/conflict、restart orphan、auth failure、malformed。前 13 个 contract rows必须 PASS；最后 `real_oauth` required row必须 `blocked + needs_login`，整体 report必须 blocked。报告、日志、异常和 JSON 对 Authorization/OAuth/arguments/result/bridge canary 必须无匹配。

禁止启动 Codex进程、读取 credential、调用真实 Provider、把 fake报告标记 local_verified/pass、修改dashboard/checkbox/项目规则。

## 后续门禁

Fresh full matrix与High Review PASS后，请求Task 8真实本地OAuth smoke显式授权。
