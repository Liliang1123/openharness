# Dev Runbook

> Local-only manual E2E procedures. Do not commit secrets.

## Prerequisites

- `.env` at repo root contains a real LLM provider key. Currently configured to read **Zhipu GLM** key from `SENSENOVA_API_KEY` (legacy var name).
  - Zhipu key format: `<id>.<secret>`, free tier: `glm-4-flash`
  - To use a different provider, edit `backend/src/main/resources/application.yml` `default-provider` + add a provider entry
- `.env` is gitignored
- Java 21 + Maven, Node 20+, pnpm

## Verified working baseline (2026-05-25)

`default-provider: zhipu`, `glm-4-flash` model, `https://open.bigmodel.cn/api/paas/v4/chat/completions`. Real answer received with `trace.events = [AGENT_START, MODEL_NODE_START, MODEL_NODE_END, FINAL_ANSWER]`.

## Start services

```bash
# terminal 1 — backend (reads .env via spring-boot-maven-plugin)
cd backend && set -a && . ../.env && set +a && mvn spring-boot:run

# terminal 2 — agent-runtime
cd agent-runtime && pnpm dev
```

## Real LLM chat (zhipu glm-4-flash by default)

```bash
curl -s http://localhost:3001/api/v1/agent/chat -X POST \
  -H "Content-Type: application/json" \
  -H "X-User-Id: dev" -H "X-Tenant-Id: dev" \
  -H "X-Trace-Id: tr-real" -H "X-Request-Id: rq-real" \
  -d '{"conversationId":"conv-real","message":"用一句话介绍 OpenHarness"}'
```

成功条件：返回非空 `answer`，`trace.events` 含 `MODEL_NODE_END`。失败时检查 backend log 是否有 `PROVIDER_UNAVAILABLE`。

## P2a MCP E2E

```bash
# repo root mcp.json 已配 server-everything
ps aux | grep server-everything | grep -v grep   # 应有 2 行（npx + 子进程）
pkill -f "tsx src/index.ts"
ps aux | grep server-everything | grep -v grep   # 应为 0
```

## P2b sessions API

```bash
curl -s http://localhost:3001/api/v1/sessions -H "X-Tenant-Id: dev"
curl -s http://localhost:3001/api/v1/sessions/conv-real -H "X-Tenant-Id: dev"
curl -s -X DELETE http://localhost:3001/api/v1/sessions/conv-real -H "X-Tenant-Id: dev"
```

## Local Codex operator control

Prerequisites:

- Java 21 and a locally installed official Codex CLI/app on `PATH`.
- A Codex build that supports `login`, `login status`, `logout`, and the app-server v2
  protocol used by this change. Pin the exact build recorded by real qualification; an
  unqualified newer/older build is not assumed compatible.
- An explicit `openai-codex/<model>` route. Codex must not be the default provider.
- A graphical session for browser-based login. Headless/device-code-only environments may
  require running the official Codex CLI directly because OpenHarness intentionally
  discards delegated CLI output.

Build the backend classes, then run the local control from the repository root:

```bash
mvn -o -f backend/pom.xml -DskipTests compile
java -cp backend/target/classes \
  org.openharness.backend.service.provider.CodexOperatorControl status
java -cp backend/target/classes \
  org.openharness.backend.service.provider.CodexOperatorControl login
java -cp backend/target/classes \
  org.openharness.backend.service.provider.CodexOperatorControl logout
```

If the executable is not named `codex`, set only its executable path:

```bash
OPENHARNESS_CODEX_COMMAND=/absolute/path/to/codex \
  java -cp backend/target/classes \
  org.openharness.backend.service.provider.CodexOperatorControl status
```

The command prints exactly five non-secret fields: `providerId`, `readiness`,
`processState`, `modelAvailability`, and `needsLogin`. It never prints delegated stdout or
stderr. `needsLogin=true` means use the official login surface and retry status; after
logout, Codex routes remain fail-closed until login is restored. The command does not start
the Gateway app-server child; normal backend startup owns that bounded process lifecycle.

Platform limitations: only local process execution is supported. Remote login endpoints,
credential-file import, token flags, arbitrary pass-through arguments, and Windows-specific
launcher discovery are not supported. The security boundary is documented in
[auth_contract.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/architecture/auth_contract.md).
