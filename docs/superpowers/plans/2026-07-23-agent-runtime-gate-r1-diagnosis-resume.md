# Agent Runtime Gate R1 诊断恢复实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 按任务顺序执行；出现硬失败立即停线并保留一次性证据。

**目标：** 在不改变 Runtime API、持久化语义、Gate D workload 或阈值的前提下，完成新的三变量本地诊断，确认第 002 次 Gate D admission / durable replay 退化的主因，为后续 TDD 修复提供唯一证据入口。

**执行架构：** 在独立 worktree 中启动一个固定的本地 Java Gateway，依次运行 `full-oracle`、`workload-only`、`incremental-oracle` 三个 30 分钟诊断。每个变体使用独立新 SQLite 和 report；全部通过结构校验后，由现有 analyzer 生成不可覆盖的根因决策。

**技术栈：** TypeScript、Node.js、tsx、pnpm、SQLite、Spring Boot、Maven、jq。

## 执行边界

- OpenSpec 依据为已批准且 active 的 [proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)、[design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md) 与 [tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)。
- 恢复决策依据为 [Gate D 性能失败恢复最终计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-16-agent-runtime-gate-d-recovery-final-plan.md)。
- 本计划只执行 Gate R1；不启动正式 24 小时 Gate D，不修改正式 workload、阈值、API、retention、outbox lifecycle 或持久化语义。
- 本轮不 archive OpenSpec，不修改 Dashboard，不提交、推送、合并、打 tag 或清理历史证据。
- 历史证据仅保存在 [外部冻结目录](file:///Users/elvis/file/develop/opensource/openharness-evidence/add-openclacky-runtime-parity-roadmap/2026-07-22-gate-d-gate-r1/)；本轮不得打开历史 SQLite 写连接，也不得复用旧 runId、文件名或 report。
- 新证据仅写入 [Gate R1 20260723 evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/)。

## 固定诊断参数

| 项目 | 固定值 |
|---|---|
| conversations | 10,000 |
| concurrency | 20 |
| workload mix | chat 60% / cancel 20% / tool 15% / MCP 5% |
| sample interval | 30 秒 |
| samples per variant | 60 |
| duration per variant | 30 分钟 |
| Java URL | `http://127.0.0.1:18084` |
| admission threshold | 100ms |
| durable replay threshold | 250ms |

## Task 1：建立新证据边界并完成执行前检查

**Files:**

- Create: [本轮 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/mcp-config.json)
- Create: [计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-23-agent-runtime-gate-r1-diagnosis-plan-review.md)

### Step 1：校验源码与基线

运行：

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse '@{u}'
pnpm test
pnpm typecheck
mvn -o -f backend/pom.xml clean test
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
git diff --check
```

预期：

- HEAD 与 upstream 均为 `9d36bfeff2cae70a07846d9cc27ad7ba586b46b4`。
- TypeScript 716 tests、Java 208 tests、typecheck、OpenSpec 23 changes 与 Dashboard check 全部通过。
- 仅本计划和计划 Review 是预期 tracked 变更；无既有源码修改。

### Step 2：建立一次性目录和 MCP config

创建 mode `0700` 的新 evidence 目录。使用 `apply_patch` 创建 MCP config，内容固定为：

```json
{
  "mcpServers": {
    "qualification": {
      "command": "/Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/node_modules/.bin/tsx",
      "args": [
        "/Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/fixtures/mcp/qualification-server.ts"
      ],
      "description": "Credential-free deterministic Gate R1 qualification fixture",
      "timeoutMs": 30000,
      "idleTimeoutMs": 300000
    }
  }
}
```

随后将文件权限设为 `0600`，并验证 command、fixture 都存在且可读。

### Step 3：执行 fail-closed preflight

运行只输出脱敏结果的检查：

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 1
EVIDENCE="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
test "$ROOT" = "/Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion"
test "$(git rev-parse HEAD)" = "9d36bfeff2cae70a07846d9cc27ad7ba586b46b4"
test "$(git rev-parse '@{u}')" = "$(git rev-parse HEAD)"
test ! -L "$EVIDENCE" && test -d "$EVIDENCE"
test "$(stat -f '%Lp' "$EVIDENCE")" = "700"
test "$(stat -f '%Lp' "$EVIDENCE/mcp-config.json")" = "600"
test -x /opt/homebrew/bin/mvn
/opt/homebrew/bin/mvn -version | sed -n '1p' | grep -Fx 'Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)'
test "$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')" -ge 25165824
test -z "$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t 2>/dev/null)"
test "$(awk '/^[[:space:]]*private static final String TOKEN = "Bearer [^"]+";[[:space:]]*$/ { count += 1 } END { print count + 0 }' "$AUTH_FILTER")" = "1"
for target in \
  gate-r1-20260723-full-001.sqlite \
  gate-r1-20260723-full-001.sqlite.lock \
  gate-r1-20260723-full-001-report.json \
  gate-r1-20260723-workload-001.sqlite \
  gate-r1-20260723-workload-001.sqlite.lock \
  gate-r1-20260723-workload-001-report.json \
  gate-r1-20260723-incremental-001.sqlite \
  gate-r1-20260723-incremental-001.sqlite.lock \
  gate-r1-20260723-incremental-001-report.json \
  gate-r1-20260723-decision.json \
  java-gateway-18084.log
do
  test ! -e "$EVIDENCE/$target" && test ! -L "$EVIDENCE/$target"
done
printf 'gate_r1_preflight=pass\n'
```

任何目标已存在、端口被占、磁盘少于 24GiB、credential declaration 不是唯一匹配或计划 Review 不是 `通过`，立即停止，不自动换名或重试。

## Task 2：启动并绑定 Java Gateway

**Files:**

- Create: [Java lifecycle log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/java-gateway-18084.log)

### Step 1：在受控 PTY 中启动

从 [backend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/) 执行，保留同一 PTY session id：

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 1
LOG="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/java-gateway-18084.log"
test ! -e "$LOG" && test ! -L "$LOG" || exit 1
umask 077
set -o pipefail
/opt/homebrew/bin/mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=18084 2>&1 | tee "$LOG"
```

### Step 2：校验 readiness 与进程归属

```bash
curl -fsS --max-time 2 http://127.0.0.1:18084/actuator/health | jq -e '.status == "UP"' >/dev/null
JAVA_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t)"
test -n "$JAVA_PID"
test "$(printf '%s\n' "$JAVA_PID" | wc -l | tr -d ' ')" = "1"
case "$(ps -p "$JAVA_PID" -o command=)" in
  (*org.openharness.backend.OpenHarnessBackendApplication*--server.port=18084*) ;;
  (*) exit 1 ;;
esac
printf 'java_gateway=ready pid=%s\n' "$JAVA_PID"
```

同一个 Java 进程必须服务三个串行变体。任何 readiness、唯一 PID 或命令指纹不匹配均停止。

## Task 3：串行执行三变量诊断

**Files:**

- Create: [full SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-full-001.sqlite)
- Create: [full report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-full-001-report.json)
- Create: [workload SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-workload-001.sqlite)
- Create: [workload report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-workload-001-report.json)
- Create: [incremental SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-incremental-001.sqlite)
- Create: [incremental report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-incremental-001-report.json)

固定执行顺序：

| 顺序 | runId | variant |
|---:|---|---|
| 1 | `gate-r1-20260723-full-001` | `full-oracle` |
| 2 | `gate-r1-20260723-workload-001` | `workload-only` |
| 3 | `gate-r1-20260723-incremental-001` | `incremental-oracle` |

### Step 1：每个变体运行前检查

- Java health 仍为 `UP`，监听 PID 与 Task 2 相同。
- 对应 SQLite、lock、report 均不存在且不是 symlink。
- 剩余磁盘仍不少于 12GiB。
- 前一个变体已 numeric exit `0` 且通过结构校验。

### Step 2：运行当前变体

每个变体使用以下模板，替换表中精确 `RUN_ID` 与 `VARIANT`；三个命令不得重叠：

```bash
set +x
ROOT="$(git rev-parse --show-toplevel)" || exit 1
EVIDENCE="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
RUN_ID="gate-r1-20260723-full-001"
VARIANT="full-oracle"
OPENHARNESS_SERVICE_TOKEN="$(/usr/bin/sed -n 's/^[[:space:]]*private static final String TOKEN = "Bearer \([^"]\{1,\}\)";[[:space:]]*$/\1/p' "$AUTH_FILTER")" || exit 1
test -n "$OPENHARNESS_SERVICE_TOKEN" || exit 1
case "$OPENHARNESS_SERVICE_TOKEN" in (*[[:space:]]*|Bearer*) exit 1;; esac
export OPENHARNESS_SERVICE_TOKEN
cd "$ROOT/agent-runtime" || exit 1
pnpm diagnostic:gate-d-performance -- run \
  --project-root "$ROOT" \
  --run-id "$RUN_ID" \
  --variant "$VARIANT" \
  --java-url http://127.0.0.1:18084 \
  --mcp-config "$EVIDENCE/mcp-config.json" \
  --sqlite-path "$EVIDENCE/$RUN_ID.sqlite" \
  --output "$EVIDENCE/$RUN_ID-report.json"
RUN_STATUS=$?
unset OPENHARNESS_SERVICE_TOKEN
exit "$RUN_STATUS"
```

对第二、第三个变体只替换：

```text
RUN_ID=gate-r1-20260723-workload-001 VARIANT=workload-only
RUN_ID=gate-r1-20260723-incremental-001 VARIANT=incremental-oracle
```

每个运行启动后，从控制面观察一次 CLI → Runtime → MCP 子进程链；运行结束后只接受 numeric exit `0`。如果发生 hard failure、CLI 提前结束、Java 退出或出现无法归属的孤儿进程，停止且不得开始后续变体。

### Step 3：逐个验证不可变输出

每个 report 必须满足：

- mode `0600`，对应 SQLite 与 lock 也是 mode `0600`；
- `schemaVersion == 1`、`track == "local"`、`evidenceKind == "gate-d-performance-diagnostic"`；
- runId、variant、database basename 精确匹配；
- `durationMs == 1800000`、`sampleIntervalMs == 30000`；
- exactly 60 samples，sampleIndex 为 `0..59`；
- report 与 sample 均无 hard failure；
- full probe signature 为 7 个固定 probe，workload 为 0 个，incremental 仅为 `incremental-events`。

校验失败即 Gate R1 `BLOCKED`，不修补或覆盖 report。

## Task 4：生成根因决策并完成诊断 Review

**Files:**

- Create: [根因 decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-decision.json)
- Create: [诊断 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-23-agent-runtime-gate-r1-diagnosis-review.md)

### Step 1：运行 analyzer

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 1
EVIDENCE="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001"
cd "$ROOT/agent-runtime" || exit 1
pnpm diagnostic:gate-d-performance -- analyze \
  --project-root "$ROOT" \
  --full-report "$EVIDENCE/gate-r1-20260723-full-001-report.json" \
  --incremental-report "$EVIDENCE/gate-r1-20260723-incremental-001-report.json" \
  --workload-report "$EVIDENCE/gate-r1-20260723-workload-001-report.json" \
  --output "$EVIDENCE/gate-r1-20260723-decision.json"
```

### Step 2：独立解释证据

诊断 Review 必须：

- 以 `通过`、`有风险` 或 `需修改` 开头；
- 分开记录历史 Gate D attempt 002、旧 Gate R1 observer blocked 与本轮有效三变量证据；
- 给出三个变体首 10 / 末 10 样本 admission、replay 中位数及相对差异；
- 给出 probe duration、runtime event / pending event / database growth 趋势；
- 对 `database-oracle-contention`、`session-replay-growth`、`outbox-backlog` 分别判定 confirmed、contributing、rejected 或 unresolved；
- 明确下一步能否沿用 active OpenSpec change。

### Step 3：Gate R2 分支

- 若主因确认且修复不改变 API、retention、outbox lifecycle、正式 workload 或阈值：沿用 active change，创建新的 TDD 修复实施计划，经 High Review `通过` 后实施。
- 若需要改变上述任一契约：创建新的 OpenSpec proposal，获批前停止实现。
- 若 analyzer 为 `inconclusive`：不得猜测修复；基于三份 report 设计一个新的单变量诊断或提交人类架构决策。

## Task 5：关闭 Java 生命周期并做证据审计

### Step 1：停止受控 Java PTY

仅向 Task 2 保留的同一 PTY session 发送一次 Ctrl-C，等待 numeric exit；不得按名称或端口范围批量 kill。

### Step 2：最终审计

```bash
test -z "$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t 2>/dev/null)"
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
git diff --check
git status --short --branch
```

确认：

- Java、Runtime、MCP 无遗留进程；
- 所有新 evidence 均属于本轮且没有 secret；
- 历史冻结目录未修改；
- Dashboard 未触发同步节点；
- 本轮只落盘计划、Review 与本地诊断 evidence。

## 完成标准

本计划仅在以下全部满足时完成：

1. 三个 30 分钟变体均完整产生 60 个有效样本；
2. analyzer decision 已生成且不可覆盖；
3. 诊断 Review 经独立 High Review 为 `通过`；
4. Java / Runtime / MCP 生命周期全部清理；
5. 已基于证据选择 Gate R2 的 OpenSpec 路径。

本计划完成不等于 Gate D PASS，也不授权正式 24 小时运行、promotion、archive 或发布。
