# Gate B Project-Local Path And Source Inventory Review

## 结论

有风险：已按用户确认在稳定主项目根下建立 Gate B project-local operational layout，新建 production/sqlite、backup 和 evidence 目录均为 owner-only `0700`，SQLite target 尚不存在且未发生任何 SQLite write。现有 sessions source 包含 39 个可解析 JSON，其中 38 个 history 文件共 6,689 条 messages，另有 1 个 pending-approval JSON；memory source 为空。

当前仍不能生成 production import/cutover evidence：38 个 history 文件都没有 `userId`，必须先提供显式 owner mapping；pending-approval JSON 不符合 history importer shape，预期进入 quarantine 或需要明确排除决策；sessions source 是既有 `0755` 目录，尚未收紧权限。Gate B 继续保持 `pending_production_evidence`。

## Review 范围

- [Stable project root](file:///Users/elvis/file/develop/opensource/openharness/)
- [Runtime data root](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/)
- [History JSON source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/sessions/)
- [Memory JSON source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/memory/)
- [SQLite target directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/)
- [Gate B backup root](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/backups/gate-b/)
- [Gate B evidence workspace](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/)
- [JSON importer](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/jsonImporter.ts)
- [Git ignore rules](file:///Users/elvis/file/develop/opensource/openharness/.gitignore)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Previous environment preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-production-environment-preflight-review.md)

## 主要发现

### Pass — 稳定、Git-safe 的 operational layout 已建立

选择主项目的 Runtime data root，而不是 integration worktree。现有 ignore rule 已覆盖整个 data root，因此 production JSON、SQLite、backup 和临次 evidence 不会按正常 Git 路径进入版本控制。新建 production root、SQLite directory、Gate B backup root 和 evidence workspace 均为 owner `elvis:staff`、mode `0700`。

### Blocker — Legacy history 缺少 userId owner mapping

内容安全的聚合 schema inventory 发现 38/38 history JSON 的 top-level shape 为 `conversationId,messages,tenantId,updatedAt`，全部缺少 `userId`。Importer contract 要求按 tenant/conversation 提供显式 owner mapping；不得从 tenantId、目录名、当前操作系统用户或默认值推断生产 userId。

### Blocker — Pending approval artifact 需要 quarantine decision

39 个 JSON 中有 1 个 top-level shape 为 `conversationId,pendingApprovals,tenantId`。当前 history importer 会把 history directory 下的 JSON 作为 history 输入，该文件不含 messages，不能作为 stable history 导入。Production evidence 必须明确记录它进入 secret-safe quarantine，或在 backup 后由 owner 明确批准排除；不得静默丢弃或伪装为 history PASS。

### Risk — Existing sessions source 权限为 0755

sessions source 是本轮之前已经存在的目录，mode 为 `0755`；本轮遵守 preflight 边界，没有擅自修改既有生产候选目录权限。memory source 与所有新建 production directories 为 `0700`。在生成含路径/hash 的正式 manifest 前，应确认 Runtime service user 与 operator 均为当前 owner，并将 sessions 收紧到 `0700`，否则 source path metadata 可被同机其他用户枚举。

### Observation — 非 JSON 文件不会进入 importer manifest

sessions source 还包含 5 个 Markdown 文件，未读取内容。Importer 只枚举 JSON，因此这些文件不会进入 JSON import 或当前 backup hash manifest。Owner 必须确认它们是非生产旁路材料，或在正式 backup 方案中作为 source-directory auxiliary files 单独覆盖。

### Pass — 容量与 target 初始状态满足继续 preflight

SQLite target 文件不存在，未发生 first write。所在文件系统约有 127,768,392 KiB 可用、使用率 87%；当前 source 约 1,252 KiB，容量足以进行 backup/import rehearsal，但 87% 使用率仍应在 formal cutover 前结合 low-disk threshold 复核。

## 最终建议

1. 由数据 owner 指定这 38 个 legacy conversations 的 production `userId`。若确实都属于同一用户，可提供一个统一 userId 并明确批准生成 38 项 mapping；否则必须提供逐 conversation mapping，且不要在会话中粘贴消息内容。
2. 明确 pending-approval JSON 的处理选择：推荐在 backup/hash 后进入 secret-safe quarantine，不导入待审批状态，因为 restart contract 要求旧 pending approvals 失效。
3. 确认当前 Runtime 以 owner `elvis` 运行后，将 sessions source 从 `0755` 收紧为 `0700`。
4. 确认 5 个 Markdown 文件是否属于生产数据；推荐作为 auxiliary backup files 保存 hash/copy，但不交给 JSON importer。
5. 上述决定齐全后，生成时间戳 backup/evidence directory 和只读 pre-cutover manifest；仍不创建 SQLite 文件，直到 manifest Review PASS。

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不新增 change。
- Superpowers：继续执行既有 Task 8 strict evidence gate；无需新 implementation plan。
- 生产写入：未授权 first SQLite write；当前只允许 source hardening 与只读 backup/hash preflight。
- Dashboard/tasks：不得更新 Stage 0 状态或勾选 2.6/2.7。
- 人工输入：需要 owner mapping、pending-approval decision、sessions permission confirmation、Markdown auxiliary-file decision、RPO/RTO 和 cutover owner。
- 项目规则：未修改。
