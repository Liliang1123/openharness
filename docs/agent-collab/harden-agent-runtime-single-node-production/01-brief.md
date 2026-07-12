# harden-agent-runtime-single-node-production Step 01 Brief

文档类型：Implementation Brief
日志及版本：2026-07-09 v1
执行角色：Codex（external implementer）
Governor：Grok（方案 + review；本步不写实现）
预计耗时：90–150m；超时写 timeout audit，禁止硬撑超 scope

## 1. 项目路径

**唯一实施 worktree（必须在此工作）：**

`/Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout`

分支提示：`stage0-runtime-production-closeout`

主仓 `/Users/elvis/file/develop/opensource/openharness` 仅作合同/Brief 对照；**不要**在主仓 `feat/*` 分支上改 Stage 0 实现。

## 2. 任务目标

本步只做一件完整业务切片：

> **为 OpenAI-compatible Gate C 补「正式 real-provider matrix harness」+ 可安全观测的 retry / terminal_error / cancellation 证据路径；并保证 timeout → structured `PROVIDER_TIMEOUT` 不回归。**

本步 **不是**：

- 关闭 Gate C
- 勾选 tasks 3.1 / 3.2 / 3.5 / 3.6
- 重开 Anthropic 为 Gate C required
- 实施 `add-chatgpt-oauth-auth`
- 用 mock 把 production required row 写成 PASS
- commit / merge / archive / freeze

### 背景（已锁定，禁止改口）

| 项 | 状态 |
|---|---|
| Gate C required family | **OpenAI-compatible only** |
| Anthropic | **deferred / post-Gate-C**（`defer-anthropic-from-gate-c` 已批准并对齐） |
| 既有 Zhipu production report | overall `blocked`；sync/usage/stream/tool/timeout 已有 pass 证据 |
| timeout | 已从裸 HTTP 500 修到 `PROVIDER_TIMEOUT` / structured path — **禁止回归** |
| 仍 blocked | retry、terminal_error、cancellation、reasoning |

Zhipu 审查（worktree，注意其中旧「双 family Gate C」句已 **过时**，以 deferred Anthropic 合同为准）：

- [Zhipu matrix review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-zhipu-openai-compatible-production-matrix-review.md)
- [Zhipu production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)

## 2.1 Handoff Contract

权威状态：

[status.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/status.md)

只读字段（禁止改）：`mode`、`approval_status`、`risk_profile`。

<!-- COOP_HANDOFF_CONTRACT_START -->
```yaml
schema_version: 1
change_id: harden-agent-runtime-single-node-production
mode: approved-implementation
approval_status: approved
risk_profile: strict
batch_profile: staged
current_batch: 1
planned_batches: 3
executor: external-agent
governor: codex-brief-antigravity-review
next_owner: external-agent
step_critical:
  - "mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test"
  - "pnpm --filter @openharness/shared-schema test -- schema"
  - "npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive"
  - "npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive"
  - "git diff --check"
final_critical:
  - "OpenAI-compatible real production matrix overall PASS (later batch)"
business_acceptance:
  unit: required
  pipeline: optional
  api: required
  real_business: optional
readonly_fields:
  - mode
  - approval_status
  - risk_profile
```
<!-- COOP_HANDOFF_CONTRACT_END -->

## 2.2 Evidence Profile

**strict**（provider 错误契约 + 资格 harness；本步 real 调用 **optional**，见第 10 节）

- 单测 / fake matrix 不能替代「真实 production row PASS」——本步也 **不要求** 把 production overall 跑成 PASS。
- 若本步做了真实 Provider 调用：必须 secret scan + redacted report；禁止密钥入库。

## 3. 允许修改的文件

仅限 worktree 内：

### 首选（harness / qualification）

- `backend/src/main/java/org/openharness/backend/qualification/**`
- `backend/src/test/java/org/openharness/backend/qualification/**`
- `backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java`（仅 timeout/terminal 结构化回归相关）
- 新建（如需要）：`backend/src/main/java/org/openharness/backend/qualification/real/**` 或同级 package 下 real-matrix runner
- 新建报告模板目录写入：`docs/verification/agent-runtime-v1/providers/`（仅 redacted JSON + 可选 sha 记录）
- 协作产物：`docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md`（或 `01-report-abort.md`）
- 必要说明（短）：`docs/review/` 下 **实现备注** 仅当 report 写不下时；优先写 report

### 仅当 RED 证明现有路径无法表达 structured terminal / cancel / retry 时（最小 diff）

- `backend/src/main/java/org/openharness/backend/api/ModelController.java`
- `backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java`
- `backend/src/main/java/org/openharness/backend/service/provider/*` 中与 timeout/retry/error 直接相关的类型
- `packages/shared-schema/src/index.ts` **仅当** 需要为 matrix row / errorClass 补已有契约缺口（先证明 gap）
- `packages/shared-schema/test/schema.test.ts` 对应测试

## 4. 禁止修改的范围

- `openspec/changes/harden-agent-runtime-single-node-production/tasks.md` 勾选状态（3.1/3.2/3.5/3.6 禁止勾）
- `openspec/changes/defer-anthropic-from-gate-c/**` 合同语义回退
- `openspec/changes/add-chatgpt-oauth-auth/**` 与任何 OAuth 实现
- Frontend / TS Runtime Agent loop 大改（本步非目标）
- Anthropic real credential 强跑（无 key 时必须 deferred，不得 fake PASS）
- Gate B / Gate D soak / archive / dashboard `verified`/`archived` 推进
- 任何 `git add` / `git commit` / `git push` / `git reset` / `git clean`
- 把密钥、`.env`、token 写入 report 或 git 可追踪文件
- 放宽 required oracle、把 unsupported 能力写成 PASS
- 主仓与 worktree 无脑双写无关文件

## 5. Git / 工作区硬约束

1. 开始前记录：`git status --short`、`git rev-parse --abbrev-ref HEAD`、`git rev-parse --show-toplevel`
2. 若 worktree 已有 **他人/既有** 未提交改动：只在允许路径追加；**禁止** revert/reset 用户改动
3. 禁止 commit
4. 结束时 `git status --short` + `git diff --stat` 写入 report
5. `git diff --check` 必须 clean

## 6. 允许副作用

| 副作用 | 条件 | 回滚 |
|---|---|---|
| 本地 Maven / pnpm 测试 | 必须 | 无 |
| 本地 loopback fake HTTP server | 必须（fake matrix） | 进程退出 |
| 临时 Java Backend 端口 | **仅当** 用户/环境已授权真实 Zhipu 且本步选择做 optional real smoke | graceful shutdown；确认端口无监听 |
| 真实 Zhipu HTTP 调用 | **optional**；需 worktree `.env` 中 `ZHIPU_API_KEY` 且用户未禁止 | 不持久化密钥；report 脱敏 |
| 写 redacted provider report JSON | 允许 | 保留为证据，勿含 secret |

**禁止**：对公网乱扫、改生产部署、改 DNS、删除数据库。

## 7. 需求来源

- Active change tasks：`openspec/changes/harden-agent-runtime-single-node-production/tasks.md`（3.1 / 3.5）
- Provider delta（Gate C OpenAI-only）：`openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md`
- Deferred Anthropic：`openspec/changes/defer-anthropic-from-gate-c/**`
- Stage 0 plan Task 10：`docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md`
- 合同对齐复核通过：`docs/review/2026-07-09-defer-anthropic-contract-alignment-review.md`
- Zhipu blocked 证据：worktree `docs/verification/.../2026-07-09-zhipu-openai-compatible-production.json`

## 8. 子问题列表与覆盖边界

| 子问题 | 本步覆盖 | 验证 | 不覆盖说明 |
|---|---|---|---|
| timeout → structured `PROVIDER_TIMEOUT` 不回归 | **是** | ModelControllerTest + fake/real timeout row | 不重写无关 controller |
| 正式 real-provider matrix harness（可复跑、可出 report） | **是** | 代码 + 本地 fake 跑通 + report schema | 不要求本步 overall production PASS |
| retry 安全证据路径（503 注入可观测） | **是** | fake 必过；real 若无安全注入可 `blocked` 但 harness 要能记录 blocked reason | 禁止用「跳过」当 PASS |
| terminal_error 安全证据路径 | **是** | fake 必过；real 可用 invalid model/auth **一次性安全** 手段，失败则 blocked+原因 | 禁止破坏长期 credential 配置不恢复 |
| cancellation 证据路径 | **是（尽力）** | in-process cancel 或明确 API gap → blocked + 设计缺口说明 | 若需新 public cancel API 超 scope：写 blocked + 下一批 brief 建议，勿擅自扩前端 |
| reasoning 真实验收 | **否** | — | 下一批；glm-4-flash 能力问题单开 |
| Anthropic real matrix | **否** | — | deferred |
| ChatGPT OAuth | **否** | — | 未批 B |
| 勾 3.1 / 关 Gate C | **否** | — | 禁止 |

## 8.1 实现细节（standard/strict）

### 目标行为

1. **Harness**
   - 单一入口（Java main/test runner 或明确 Maven/脚本命令）可跑 OpenAI-compatible matrix。
   - 支持 `track=local`（fake）与 `track=production`（real，optional）。
   - 每 row：environment fingerprint、protocolVersion、capabilities、requestHash、observed、oracle、durationMs、result、blocked reason（若 blocked）。
   - overall result：任 required row `fail`/`blocked` ⇒ overall 不得 `pass`。
   - 输出 JSON 符合 shared-schema / 既有 provider report shape。

2. **timeout**
   - 保持 `PROVIDER_TIMEOUT` 结构化错误（httpStatus 语义与现有 controller 一致，如 504 body）。
   - 回归测试必须覆盖。

3. **retry**
   - Fake：503 后成功可观测（既有 fake 逻辑可复用/收敛到 harness）。
   - Real：若无法安全注入 503，row=`blocked`，reason 写清「无安全注入」；**不得** PASS。

4. **terminal_error**
   - Fake：400/terminal 可观测。
   - Real：仅允许短暂、可恢复的 invalid request（如坏 model id）或显式测试 credential 隔离配置；结束后恢复配置；失败则 blocked。

5. **cancellation**
   - 优先 adapter/in-process cancel 可测路径。
   - 若 public API 无 cancel：row=`blocked`，report 记录 gap；**不要**为了本步去改 Frontend。

### 不变量

| 不变量 | 阻断 |
|---|---|
| 密钥不进 report/log | 是 |
| required row 不得 skip 成 PASS | 是 |
| Anthropic 缺 key 不得拖垮 OpenAI-compatible harness 设计 | 是 |
| 不修改 tasks 勾选 | 是 |
| timeout 结构化行为不回归 | 是 |

### TDD

1. RED：为 harness 或缺失路径写失败测试（优先 `backend/.../qualification/*Test.java`）。
2. GREEN：最小实现。
3. 再跑 step_critical。

## 9. 必须执行的验证命令

在 worktree 根目录：

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --show-toplevel

mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test

pnpm --filter @openharness/shared-schema test -- schema

npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive

git diff --check
```

若新增 harness 测试类，把类名加入 Maven `-Dtest=` 列表并在 report 写明。

Optional real smoke（仅授权时）：

```bash
# 启动临时 Backend → 跑 harness production track → graceful shutdown → 端口无监听
# secret scan report for ZHIPU_API_KEY / sk- / Bearer raw
```

## 10. 业务验收标准

| 验收层级 | 必须？ | PASS 条件 |
|---|---|---|
| 单元 / fake matrix | **是** | OpenAI fake matrix + controller timeout 相关测试绿 |
| shared-schema | **是** | schema tests 绿；若写出 report 则 parse 通过 |
| harness 可运行 | **是** | 文档化一条命令；local track 产出合法 report |
| retry/terminal/cancel 路径 | **是** | 每条要么 fake/local pass，要么 production blocked+审计原因；禁止静默 skip |
| timeout 回归 | **是** | structured PROVIDER_TIMEOUT 测试绿 |
| 真实 production overall PASS | **否** | 留给 batch 02+ |
| Gate C 关闭 | **否** | 禁止 |

## 11. Key Assertions

| 断言 | 期望 |
|---|---|
| A1 | 存在可重复执行的 OpenAI-compatible matrix harness 入口 |
| A2 | local/fake 覆盖 sync 或既有能力集不退化；retry/timeout/terminal 至少可在 fake 证明 |
| A3 | production track 对 retry/terminal/cancel 若未跑通 → `blocked` 非 `pass` |
| A4 | report 无 `ZHIPU_API_KEY` / raw bearer / sk- 明文 |
| A5 | tasks.md 3.1 等仍为 `[ ]` |
| A6 | Anthropic 未变成 Gate C required |
| A7 | 未引入 ChatGPT OAuth 代码 |

## 12. 交付物（Codex 必须写）

1. **Report（必须）**
   [01-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/harden-agent-runtime-single-node-production/01-report.md)
   同步一份到 worktree 同相对路径（若 worktree 有独立 docs）。

2. Report 必须包含：
   - 变更文件列表 + 简述
   - RED/GREEN 证据
   - step_critical 命令与 exit code
   - harness 使用方法（一条命令）
   - 各 capability 路径状态表：timeout / retry / terminal_error / cancellation
   - 是否做了 real 调用（是/否）与 report 路径
   - secret scan 结果
   - 明确声明：**未勾选 3.1，未关 Gate C，未 commit**
   - 遗留问题与建议 batch 02 范围

3. 若无法完成：写 `01-report-abort.md`，说明阻塞原因与已做安全回滚。

## 13. Abort 条件

出现任一即 abort：

- worktree 脏改动会破坏未知用户工作且无法隔离
- 需要扩 scope 到 OAuth / Frontend / Anthropic required / Gate D
- 真实调用可能泄露密钥且无法脱敏
- 无法在不 commit 的前提下完成最小 GREEN

## 14. Governor Review 标准（Codex 勿自批 PASS）

Governor 将在有 Report 后写：

`docs/review/YYYY-MM-DD-harden-agent-runtime-single-node-production-step-01-review.md`

首行：`# Review Result: PASS|FAIL|BLOCKED`

仅 **PASS** 后才开 batch 02 Brief。

---

## 15. 给 Codex 的最短执行清单

1. `cd` 到 worktree；记录 git 状态
2. 读本 Brief + status.md + provider-adapter delta + Zhipu report
3. TDD：harness + retry/terminal/cancel 路径 + timeout 回归
4. 跑 step_critical
5. 写 01-report.md
6. **停止** — 等 Governor review；不要开 batch 02；不要勾 tasks
