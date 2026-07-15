# Context Compression Insert-then-Compress Restoration Review

## 结论

通过：本次 Direct Change 恢复了既有 Insert-then-Compress 契约。压缩请求现在把 request-local compression instruction 放在待压缩历史之后；instruction 不进入稳定历史。缺少 Java compression capability 时不再伪造摘要或改写历史。

## Review 范围

- [context-compression specification](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/context-compression/spec.md)
- [compression implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/compression.ts)
- [compression regression tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/compression.test.ts)
- [Agent execution compression wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentExecutionRunner.ts)
- [Java client compression transport](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/javaClient.ts)
- [Java model controller compression endpoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [Java AgentMessage contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/model/Contracts.java)

## 主要发现

### Pass — Insert-then-Compress 请求语义恢复

- 旧实现只把待压缩消息发送给 Java endpoint，没有插入 compression instruction。
- 新实现把带 `compressionInstruction=true` 的 user message 追加到本次压缩请求，Java endpoint 能在同一次摘要调用中看到原历史与压缩意图。
- instruction 只存在于请求数组；压缩调用期间 HistoryStore 保持原样，成功后只保留 compressed summary 与 recent messages。

### Pass — 删除伪摘要 fallback

- 旧实现会在 Java client 同时缺少 `compress` 与 legacy test request 能力时返回 `Summary of N messages.`，从而把未执行的模型摘要写入历史。
- 新实现抛出明确的 compression capability error。上层 auto-compress 保持既有 fail-soft 行为：记录 warning、继续当前执行，但不改写历史。

### Pass — 跨层兼容与边界

- Java `AgentMessage` 已接受 `compressionInstruction`；本次没有发送 TS/Java 命名不一致的 transient 字段。
- 归档 chunk、summary message、KEEP_RECENT、threshold、cache strategy、Provider routing 和持久化接口均未改变。
- 本轮没有真实 Provider、OAuth、API-key 或 Codex CLI 调用。

### 风险

- 无 Critical、High 或 Medium finding。
- idle compression、progressive compression、cache economics 与 UI 可观测性仍是后续新增能力，不属于本次恢复。

## 最终建议

- 接受本次恢复，后续 Runtime 研发可继续以当前 Insert-then-Compress 行为为基础。
- 下一项核心 parity 建议进入 MCP stable-schema Broker 的独立 OpenSpec proposal，而不是继续扩大本次 Direct Change。

## 后续门禁

- 不需要新 OpenSpec：本次行为已由现有 context-compression specification 明确定义，属于窄范围恢复。
- 若新增 idle compression、progressive levels、cache marker/cost UI，必须创建并批准新的 OpenSpec change。
- Dashboard 无需变更：没有创建或完成独立 OpenSpec change。
- 项目规则未修改；未执行 Git add、commit、push 或 worktree 清理。

## 验证记录

- TDD RED：新增 2 个测试，分别观察到“缺 instruction”和“缺 capability 时 promise 未拒绝”的预期失败。
- 聚焦回归：compression、autoCompress、multiStepLoop、contextBuilder、cacheHints 共 33/33 PASS。
- Agent Runtime 全量：74 test files、412/412 PASS。
- Agent Runtime typecheck：PASS。
- `git diff --check`：PASS。
