# Change: Add P1b MessageHistory Persistence + Context Compression

## Why
P0a/P0b 的 MessageHistory 是纯内存的，进程重启即丢失。生产环境需要持久化以支持长会话、多实例部署和故障恢复。同时，长上下文会导致 token 成本爆炸，需要 Insert-then-Compress 策略在后台压缩历史。

## What Changes
- **Agent-runtime**: MessageHistory 接口化，新增 SQLite 持久化实现；区分 `toApi/toPersisted/toReplay` 三种视图；Insert-then-Compress 压缩逻辑（插入 compression instruction → 调 model 生成 summary → 替换旧消息）
- **Backend**: 新增 `POST /api/v1/model/compress` 端点（复用 provider adapter，用低成本 model 做 summary）
- **Shared-schema**: 无变更（已有 `compressedSummary`/`compressionInstruction` 字段）

## Impact
- Affected specs: 新增 `message-history`、`context-compression` capabilities
- Affected code:
  - `agent-runtime/src/history.ts` → 接口化 + SQLite 实现
  - `agent-runtime/src/compression.ts` (新增)
  - `backend/src/main/java/org/openharness/backend/api/ModelController.java` (新增 compress 端点)

## Non-Goals
- Redis/PostgreSQL 持久化（P2，当前用 SQLite 满足单实例）
- LangGraph checkpointer 完整实现（本轮只做 history 持久化，checkpointer 是 P1c 或 P2）
- 分布式锁/多实例写冲突（单实例 SQLite 足够 P1b）
