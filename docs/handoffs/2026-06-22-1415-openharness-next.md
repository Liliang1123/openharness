# New Window Handoff: OpenHarness Sandbox Implementation & Next Phase Prep

## 使用方式
把本文件内容粘贴到新的 Codex 窗口，并要求继续执行未完成任务。

## 背景
- **项目路径**：[openharness](file:///Users/elvis/file/develop/opensource/openharness)
- **当前目标**：已完美闭环 `add-skill-invocation-sandbox` 阶段的开发、测试、安全防御和脱敏重构；准备开启第三阶段 `add-subagent-dispatcher`（隔离子智能体分发器）的设计与实施。
- **关键约束**：
  1. Always respond in Chinese-simplified.
  2. MANDATORY: 在每次对话开头，清晰声明模型元数据（Model name, size, type, revision）。
  3. **操作越界约束**：在本地保存代码并执行重测，绝对禁止擅自动用 `git add / git commit` 代替用户提交代码。
  4. **Artifact 路径输出规范**：创建或更新的 artifact 必须在回复中提供绝对路径的 Markdown 链接（格式如 `[文件名](file:///完整路径)`）。
  5. 物理落地规范：必须将生成的方案和 plans 实体文件写入项目对应的物理目录中。

## 已完成
- [x] **TS 运行时类型与接口修复**：补齐了注册 `invoke_skill` 时缺失的 Zod 属性字段（`isReadOnly`, `isDestructive`, `requiresApproval`, `isConcurrencySafe`），解决了 typecheck 报错。
- [x] **沙箱安全防御重构**：在 `shredder.ts` 中实现基于 `path.resolve` 的路径穿越防御，以及基于 `fs.lstatSync` 的符号链接拦截，并防范 `default-agent` 的全局元工具提权后门。补充了 `shredder.test.ts` 安全拦截测试。
- [x] **根目录 .gitignore 与 README.md 完善**：
  - [.gitignore](file:///Users/elvis/file/develop/opensource/openharness/.gitignore) 中排除了测试临时会话数据 (`agent-runtime/data/`)、构建增量缓存与开发临时交接文件 (`/docs/handoffs/`)。
  - [README.md](file:///Users/elvis/file/develop/opensource/openharness/README.md) 中补充了系统 Mermaid 时序拓扑图、核心设计（Rolling Double Buffer 与沙箱防御机制）解析，以及非常详尽的同步对话、SSE 订阅、记忆管理 API curl 调用示例。
- [x] **敏感词彻底擦除**：对项目内所有历史方案、评审报告、交接文档和 OpenSpec project 进行了敏感词排查与脱敏净化，全网完全清空了 相关敏感字符，对包含敏感名的物理文件做到了重命名。
- [x] **.gitignore 忽略策略方案落盘**：编写并落盘了 [.gitignore 策略方案文档](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-openharness-gitignore-strategy-plan.md)，对忽略策略的考量、背景与门控设计做出了详细论述。

## 当前状态
- **Active change**：`change/add-skill-invocation-sandbox` 处于 Ready 状态，需由用户决定是否直接执行 `openspec archive` 归档。
- **Archived changes**：`add-p1b-persistence` 和 `add-runtime-cache-stability` 已安全归档。
- **当前验证**：
  - `pnpm --filter @openharness/agent-runtime test` ➡️ 207 passed (100% 成功率，Vitest)。
  - `pnpm --filter @openharness/agent-runtime typecheck` ➡️ `tsc --noEmit` 成功，零编译报错。
  - `npx openspec validate --all --strict --no-interactive` ➡️ 23 passed (规格校验全绿)。
- **服务/端口状态**：
  - Java 后端服务：`http://localhost:8080`
  - TS Agent 运行时：`http://localhost:3000`
  - 前端开发服务器：`http://localhost:5173`

## 未完成 / 下一步
- [ ] **沙箱变更归档**：在根目录下运行命令归档上一阶段变更：
  ```bash
  npx openspec archive add-skill-invocation-sandbox --yes
  ```
- [ ] **创建第三阶段 OpenSpec Change**：
  ```bash
  npx openspec create add-subagent-dispatcher
  ```
- [ ] **编写子智能体分发器设计方案并评审**：
  在 `docs/design/` 下编写 `add-subagent-dispatcher` 的设计规格，明确子 Agent 的权限继承/降级（forbidden tools 限制）、工作目录隔离、Token/Cost 计费统计与超时取消传播机制。
- [ ] **子智能体分发器代码实施与单测覆盖**。

## 建议下一步
- **建议先做**：运行 `openspec archive` 归档 Sandbox 特性，然后使用 `openspec create` 创建下一阶段的 change 并编写设计规格文件。
- **不建议现在做**：不要在未完成上一阶段归档和未编写新阶段 OpenSpec 规格的情况下直接写 TS 业务代码。
- **原因**：为了维护 OpenSpec 契约驱动开发的严密性与工程可回溯性。

## 涉及文件
- [README.md](file:///Users/elvis/file/develop/opensource/openharness/README.md) (主项目说明文档)
- [.gitignore](file:///Users/elvis/file/develop/opensource/openharness/.gitignore) (Git 忽略配置)
- [project.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/project.md) (全局项目契约规格)
- [2026-06-22-openharness-gitignore-strategy-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-openharness-gitignore-strategy-plan.md) (忽略项设计考量方案)
- [2026-06-18-openharness-runtime-alignment-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-18-openharness-runtime-alignment-plan.md) (脱敏净化后的架构对齐方案)
- [2026-06-22-openharness-runtime-alignment-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-openharness-runtime-alignment-review.md) (脱敏后的方案评审报告)

## 验证记录
- `pnpm --filter @openharness/agent-runtime test` ➡️ 39 test files passed, 207 tests passed (Vitest)
- `pnpm --filter @openharness/agent-runtime typecheck` ➡️ 编译通过
- `npx openspec validate --all --strict --no-interactive` ➡️ 23 passed

## 风险 / 注意事项
- 敏感词残留防范：后续所有的开发中，绝对禁止输出或引用 相关敏感词及其简写字词，任何技术细节均通过脱敏的通用词语代指。
- 本地交接防丢：新窗口启动时，需要特别注意本地的 `/agent-runtime/data/` 目录以及 `/docs/handoffs/` 在被 gitignore 后，保证本地手写/调试环境的延续性。

## 给新窗口的启动指令
继续 OpenHarness 开发工作。不要重复已完成的任务。先阅读本 handoff 文档、项目根目录下的 `AGENTS.md`、OpenSpec 规格以及上面列出的关键文件，然后从“未完成 / 下一步”的第一个节点开始执行归档与新阶段规格的设计。
