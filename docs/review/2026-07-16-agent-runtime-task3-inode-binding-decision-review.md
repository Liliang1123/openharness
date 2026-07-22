# Agent Runtime Task 3 Inode Binding Decision Review

## 结论

需修改：Task 3 的绝对 deadline、token 防泄漏、output 原子预留、并发 claim 与真实 wiring smoke 已通过复审，但 SQLite claim 尚未把 Runtime child 的实际数据库打开绑定到已声明 inode。当前实现只能在 Runtime 启动后发现路径替换，不能阻止启动期间先写入被替换的数据库。

## Review 范围

- [诊断 Runner 实现](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [诊断 Runner 测试](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)
- [正式 Runtime child](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [已批准诊断实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)

## 主要发现

- High：Runner 使用 exclusive/no-follow 创建并持有 SQLite inode，但传给 Runtime child 的仍只是路径。路径可在 child 打开前被替换；启动后的 `dev/ino` 校验只能检测，不能防止替换目标已被迁移或写入。
- 已关闭：output 使用保留 fd 写入；两次并发运行不能共同 claim；采样使用绝对单调 deadline；全部非秘密输入在 I/O 前执行 service-token guard；真实依赖 wiring smoke 已覆盖。
- 当前两文件范围内没有可靠修复。事后轮询、重复 `stat` 或父目录 symlink 检查都不能消除 child 打开路径前的竞态。

## 最终建议

推荐扩展 Task 3：为诊断启动增加可选的 expected database identity（`dev`/`ino`）或等价的受控 storage-open 契约；Runtime child 必须在任何 migration/schema write 之前打开数据库并校验 identity，不一致立即退出。该参数仅用于 local diagnostic，不改变正式 Gate D 默认启动行为。

同时增加破坏性反例测试：在 child storage open 前将 claim 重命名，并把临时 sentinel SQLite 链接到原路径；启动必须失败，且 sentinel 的 hash/size/mtime 与内容保持不变。

不建议仅保留启动后校验，也不建议以父目录权限或更频繁 `stat` 代替 inode-bound open。

## 后续门禁

- 需要用户授权把 Task 3 范围从两个诊断文件扩展到 Runtime child/storage-open 相关源文件与测试。
- 建议先更新现有 Superpowers 实施计划与预检 Review 的文件范围，再继续 Subagent-Driven TDD。
- 若实现保持“可选诊断 identity guard、正式默认行为不变、无持久化语义变化”，可沿用 active OpenSpec，无需新 change；若要改变通用 Runtime storage-open 契约或持久化语义，则必须先更新并审批 OpenSpec。
- 修复后必须重新执行 Task 3 规格 Review、代码质量 Review、formal regression 与敏感信息/packet 元数据检查。
