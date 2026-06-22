# Superpowers Plan: add-p2c-auto-compress

> Date: 2026-05-25
> Status: Approved
> Change: `openspec/changes/add-p2c-auto-compress`

## Steps

### Step 1: agentLoop.ts — 加入 auto-compress

File: `agent-runtime/src/agentLoop.ts`

- 在每个 `history.save()` 调用前，检查 `COMPRESSION_AUTO !== 'false'`
- 若启用，调用 `shouldCompress` → `compress`，wrap in try/catch
- 失败时 console.warn，不阻塞

验证: `pnpm typecheck`

### Step 2: agentStreamLoop.ts — 同步加入

File: `agent-runtime/src/agentStreamLoop.ts`

- 同 Step 1 逻辑

验证: `pnpm typecheck`

### Step 3: 单元测试

File: `agent-runtime/test/autoCompress.test.ts`

- 测试超阈值时 compress 被调用
- 测试 compress 抛错时不影响返回
- 测试 COMPRESSION_AUTO=false 时不触发

验证: `pnpm test`

## Execution Mode

Inline sequential.
