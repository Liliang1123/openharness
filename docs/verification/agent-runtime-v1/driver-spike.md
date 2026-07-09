# Agent Runtime SQLite Driver Spike

## 结论

通过技术验证；Gate A 已于 2026-07-06 获人工批准。`better-sqlite3@12.11.1` 在目标 Node/macOS arm64 环境可工作，但 Homebrew Node 的 LTO build config 会导致默认 node-gyp 源码构建失败；安装必须显式使用官方 Node headers config。

## 环境

- Date: 2026-07-06
- Node: `v20.20.2`
- Platform: `darwin arm64`（Darwin 25.5.0）
- Compiler: Apple clang 21.0.0
- Package manager: pnpm 8.15.5
- Driver: `better-sqlite3@12.11.1`
- Types: `@types/better-sqlite3`

## 构建诊断

默认安装没有可用 prebuilt binary，转入 node-gyp 9.4.1 源码构建。Homebrew Node 的 `process.config.variables.enable_lto=true` 使 clang 生成 LLVM bitcode object，Apple libtool 拒绝归档：

```text
libtool: file: .../sqlite3.o is not an object file
```

缓存的官方 Node headers 配置为 `enable_lto=false`。固定以下环境后原生构建成功：

```bash
PYTHON=/opt/anaconda3/bin/python3 \
npm_config_nodedir=/Users/elvis/Library/Caches/node-gyp/20.20.2 \
pnpm --store-dir /Users/elvis/Library/pnpm/store/v3 \
  --filter @openharness/agent-runtime add better-sqlite3
```

构建出现两条 Node 20 header 函数指针 cast warning，但 addon 与 test extension 均成功链接，安装退出码为 0。

## 验证记录

```bash
pnpm --filter @openharness/agent-runtime test -- storageDriverSpike
```

- 5/5 tests passed。
- WAL: `journal_mode=wal`。
- Foreign keys: enabled。
- Transaction throw: insert fully rolled back。
- Configurable 200ms contention deadline: within asserted 150–700ms window。
- Default 5s contention deadline: observed 5078ms, within 4500–5500ms window。
- Close: database directory removable after `close()`。

```bash
pnpm --filter @openharness/agent-runtime typecheck
git diff --check
```

- Both exited 0。

## Driver Contract Assessment

- Transactions / `BEGIN IMMEDIATE`: supported。
- WAL / foreign keys / busy timeout: supported。
- Real temporary file isolation: supported。
- Native deployment: supported when build uses the recorded Node headers config；production packaging must reproduce this environment or provide a verified prebuilt artifact。
- Cancellation: synchronous busy wait is not externally cancellable inside one attempt；the single wall-clock deadline bounds it to 5 seconds. Long application work must not run inside the database transaction callback。
- Rollback: callback exception rolls back the active transaction。

## Gate A

Gate A approved on 2026-07-06. Approval accepts:

1. `better-sqlite3@12.11.1` as the Runtime v1 driver。
2. Native build/package reproducibility as a release requirement。
3. Synchronous transaction callbacks kept short and bounded。
4. The verified 5-second maximum contention deadline。
