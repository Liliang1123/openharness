# Stage 1 Task 8 (JSON Import & Quarantine) Code & Verification Review

- **Review 日期**：2026-07-06
- **结论**：`通过`
- **Review 范围**：
  - [jsonImporter.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/jsonImporter.ts)
  - [jsonImporter.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/jsonImporter.test.ts)
  - [task8-json-import-restore-rehearsal.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md)
  - [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/stage1-gate-b.md)
  - [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### 1. 备份哈希与幂等导入
- **数据一致性保障**：[jsonImporter.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/jsonImporter.ts) 在进行 SQLite 写入前，先对全部 legacy JSON 源文件进行 SHA-256 哈希采样并写入 `backup-manifest.json`。这为迁移提供了强有力的 RPO（恢复点目标）凭证。
- **安全的幂等替换**：历史记录使用 `SqliteHistoryStore.replace`，事实记录使用 `SqliteMemoryStore.upsert` 进行覆盖。即使重复运行，亦不产生脏数据或数量膨胀，符合幂等要求。
- **精确的所有权映射**：对于缺少 `userId` 的 legacy history，Importer 强制要求提供显式的 `ownerMappings`；缺失映射则直接安全归入隔离区，规避了越权与归属混乱的隐患。

### 2. 隔离区（Quarantine）安全隔离与脱敏
- **严密的隐私控制**：成功将解析错误、字段越界、未映射所有权的 legacy 记录过滤隔离。通过负向测试，验证了隔离清单 `quarantine-manifest.json` 仅记录 `path`、`sha256` 和 `error` 类型，并未将原文件的任何敏感数据、Canary Token（如 `sk-test-canary`）以及消息原文拷贝，防止了泄露。
- **自动门禁挂起**：若隔离清单含有条目，`automaticCutoverAllowed` 会自动置位 `false`，从而在程序上强制打断没有经过人工审计核准的自动切切。

### 3. 切切阶段（Cutover）与 RTO
- **明确的前/后向边界**：
  - `pre_cutover` 模式下，允许通过 legacy 数据进行恢复。
  - 首次成功写入 SQLite 后，系统标记切切为 `forward_fix_only`（且 `legacyWritesAllowed=false`），杜绝了写入回退造成的数据不一致。
- **演练达标**：演练表明 RTO 符合限制在 `<=` 30 分钟的目标。

### 4. 测试与静态验证
- 单元与集成测试顺利绿色通过，未观察到任何静态类型错误。

## 最终建议
- **Quarantine 非零退出码加固**：当隔离区非空且 `allowCutoverWithQuarantine` 为 `false` 时，目前是通过接口字段 `automaticCutoverAllowed=false` 声明的。建议在迁移 CLI 工具的封装层级中，针对此情况使 CLI 进程直接返回非零的退出码（如 Exit Code 1），以便运维脚本在 CI/CD 或终端执行时能触发强硬终止，避免运维人员由于没有检查 JSON 内容而强推。

## 后续门禁与下一步
- **人工 Gate B 审查**：Stage 1 代码实现与本地演练部分均已验证通过。下一步需要由人工明确签署 Gate B，同意生产环境备份哈希、隔离区处理报告、以及恢复演示产物，随后授权进行生产级 SQLite 真实切切。
