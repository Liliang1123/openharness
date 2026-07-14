# Stage 0 Environment Track Fix — Reverification Review

## 结论

通过。

上一轮 [reverification](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-worktree-feedback-followup-reverification.md) 指出的 **Medium：压缩 formal soak 报告 `report.track=local` 与 `environment.track=production` 不一致** 已在代码层闭合：

- 实现：[`formalSoakRunner.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts) 在构造 report `environment` 时写入 `track: reportTrack`（覆盖 config 继承值）。
- 回归：[`formalSoakRunner.test.ts`](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts) 成功路径与资源增长失败路径均断言 `environment.track === "local"`。
- 本轮 focused 测试 **5/5 pass**；tasks 仍为 **16/30**，Gate B/C/D 与 archive/parity 边界未放宽。

Codex 自有 review [environment-track-fix-review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-worktree-feedback-followup-environment-track-fix-review.md) 总判断正确；本文件为独立 re-verify，不替代其 TDD 记录。

## 文档类型 / 日志及版本

- 文档类型：Follow-up Fix Reverification Review
- 日期：2026-07-09
- 会话标识：stage0-environment-track-fix-reverification
- 结论：`通过`

## Review 范围

- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)（约 L152–200）
- [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)
- [2026-07-09-stage0-worktree-feedback-followup-environment-track-fix-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-worktree-feedback-followup-environment-track-fix-review.md)
- [2026-07-09-stage0-worktree-feedback-followup-reverification.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-worktree-feedback-followup-reverification.md)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

边界：未跑真实 Provider；未启 24h soak；未 archive；未做 OpenClacky parity。

## 主要发现

### Pass — M-1 残留已闭合

关键构造现为：

```ts
const reportTrack = input.compressedTestRun === true ? "local" : "production";
// ...
environment: {
  ...input.environment,
  track: reportTrack,  // 覆盖 config.environment.track
  evidenceKind,
  // ...
}
```

因此：

| 模式 | `report.track` | `environment.track` | `evidenceKind` |
| --- | --- | --- | --- |
| `compressedTestRun: true` | `local` | `local` | `compressed-test-simulation` |
| 正式路径（无 compressed） | `production` | `production` | `formal-24-hour-soak` |

`...input.environment` 之后再写 `track: reportTrack`，顺序正确，可覆盖 `createFixedTwentyFourHourSoakConfig` 注入的 `production`。

### Pass — 回归断言覆盖成功路径

```ts
expect(report.track).toBe("local");
expect(report.result).toBe("local_verified");
expect(report.environment).toMatchObject({
  track: "local",
  evidenceKind: "compressed-test-simulation"
});
```

与 RED 描述（expected local, received production）一致；当前 GREEN。

### Pass — Gate / 勾选语义未放松

- 未标记 custom delay 仍 throw。
- Gate D approval / preflight 门闩未改。
- 固定 24h / 30s / restart schedule / workload / thresholds 未改。
- tasks：**16 checked / 14 unchecked**；2.6/2.7、3.1/3.2、4.2/4.3、4.5/4.6、5.x 仍 pending。

### Pass — 失败路径断言已补齐

资源增长失败用例现在也断言 `environment.track: "local"` 与 `evidenceKind: "compressed-test-simulation"`。该补强为 test-only，不改变 runtime 代码或 Gate 语义。

### Important（上下文，非本补丁缺陷）— Stage 0 仍未完成

本补丁 **通过** 仅指 environment.track 一致性修复。仍禁止：

- 宣称 Stage 0 完成
- 关闭 Gate B / C / D
- freeze / archive
- OpenClacky parity Stage 1–9 实现

## 验证记录

本轮独立，执行目录为 [stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)：

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
# 5/5 passed
pnpm --filter @openharness/agent-runtime typecheck
git diff --check
```

tasks 计数：`checked=16 unchecked=14`。

Review 文档路径检查：18 个 `file:///` 链接通过，0 missing，0 bare local path。

采信 Codex 记录的全量 suite / OpenSpec 23/23 / dashboard / link check（本轮未重跑全量；源码与 focused 测试与声称一致）。

## 最终建议

1. **接受** environment.track 补丁与 Codex 自审结论。
2. **保留** 2.1 / 2.3 / 2.4 / 2.5 / 4.4。
3. 下一步仍是 Gate B 生产证据或经批准的 Gate C/D；合入时只带 Stage 0 worktree 意图文件。

## 后续门禁

| 项 | 结论 |
| --- | --- |
| M-1 是否闭合 | **是** |
| 是否可关闭 Gate D / archive | **否** |
| 是否修改项目规则 | **否** |
| 是否 commit/merge | 未做；本 review 不授权 |

## 摘要

窄修复正确、有回归保护、未放宽 Stage 0 门禁。结论 **通过**；Stage 0 大门仍开，属预期边界而非本补丁失败。
