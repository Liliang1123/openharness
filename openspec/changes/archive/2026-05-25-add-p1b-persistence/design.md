## Context
P0a/P0b MessageHistory 是纯内存 Map，进程重启丢失。P1b 需要持久化 + 压缩以支持生产长会话。参考标准的 JSON 文件 + chunk MD 方案。

## Goals
- 会话历史持久化，进程重启不丢失
- 长上下文自动压缩，控制 token 成本
- 压缩后 cache hints 仍然有效
- 与标准存储方案对齐

## Non-Goals
- 数据库存储（P2 用 PostgreSQL）
- 异步后台压缩（P1b 先同步，idle-time 压缩留后续）
- 多实例并发写（单实例 JSON 文件足够）

## Decisions

### 存储选型：JSON 文件
- Session 文件：`data/sessions/{tenantId}/{conversationId}.json`
- Chunk 归档：`data/sessions/{tenantId}/{conversationId}-chunk-{N}.md`
- 零依赖，可直接 cat/vim 调试，agent 可用 file_reader 读取 chunk

### Session JSON 结构
```json
{
  "tenantId": "tenant-001",
  "conversationId": "conv-001",
  "createdAt": "2026-05-22T10:00:00Z",
  "updatedAt": "2026-05-22T11:00:00Z",
  "messages": [ ... ],
  "stats": { "totalTokens": 1234, "compressionCount": 1 }
}
```

### 三种视图
```
toPersisted: 原样写入 JSON（含所有 internal flags）
toApi:       剥离 internal fields → 发给 model（现有 toModelMessages）
toReplay:    跳过 transient → 用于 session resume / 前端回放
```

### Insert-then-Compress 流程
```
1. 估算 token count（ASCII ~4 chars/token，CJK ~1.5 chars/token）
2. 超阈值 → 选择除最近 N 条外的旧消息作为压缩目标
3. 调 POST /api/v1/model/compress 生成 summary
4. 将旧消息归档为 chunk-{N}.md（Markdown + YAML front matter）
5. 用 summary (role:"user", compressedSummary:true, chunkPath:...) 替换旧消息
6. 持久化新 session JSON
7. 下次 model call 重新计算 cacheHints
```

### 持久化时机
- 每次 agent loop 完成后（final answer 发出后）
- 压缩完成后立即持久化

### 阈值配置
- `COMPRESSION_THRESHOLD=8000`（估算 token 数）
- `KEEP_RECENT_MESSAGES=6`（压缩时保留最近 N 条不压缩）

## Risks / Trade-offs
- JSON 文件大 session 读写慢 → 被压缩策略消解，session 始终 < 1MB
- 无并发安全 → 单实例 agent-runtime 不需要
- chunk MD 文件累积 → 保留最近 10 个 chunk，超出自动清理

## Open Questions
- 无阻塞项
