## 1. Agent-runtime — Auto-compress 集成
- [x] 1.1 agentLoop.ts：在 `history.save()` 前调用 `shouldCompress` → `compress`，catch 错误不阻塞
- [x] 1.2 agentStreamLoop.ts：同上
- [x] 1.3 环境变量 `COMPRESSION_AUTO`（默认 true）控制是否启用

## 2. Tests
- [x] 2.1 单元测试：验证 auto-compress 在超阈值时触发
- [x] 2.2 单元测试：验证 compress 失败不阻塞 response
- [x] 2.3 单元测试：验证 COMPRESSION_AUTO=false 时不触发

## 3. Verification
- [x] 3.1 `pnpm typecheck` 通过
- [x] 3.2 `pnpm test` 全部通过（29 tests, 6 files）
