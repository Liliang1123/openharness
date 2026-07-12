# Dev Runbook

> Local-only manual E2E procedures. Do not commit secrets.

## Prerequisites

- `.env` at repo root contains a real LLM provider key. Currently configured to read **Zhipu GLM** key from `SENSENOVA_API_KEY` (legacy var name).
  - Zhipu key format: `<id>.<secret>`, free tier: `glm-4-flash`
  - To use a different provider, edit `backend/src/main/resources/application.yml` `default-provider` + add a provider entry
- `.env` is gitignored
- Java 21 + Maven, Node 20+, pnpm

For the optional local Codex OAuth transport:

- Install the official Codex CLI. The validated protocol baseline is `codex-cli 0.144.1`; later versions require the fake protocol and focused command tests before use.
- Complete authentication only through the official Codex application/CLI. Do not place Codex OAuth values or credential paths in `.env`, Java configuration, shell history, or this repository.
- Configure a `codex-app-server` provider with a local `stdio://`, Unix socket, or approved loopback endpoint and an explicit model allow-list.

## Verified working baseline (2026-05-25)

`default-provider: zhipu`, `glm-4-flash` model, `https://open.bigmodel.cn/api/paas/v4/chat/completions`. Real answer received with `trace.events = [AGENT_START, MODEL_NODE_START, MODEL_NODE_END, FINAL_ANSWER]`.

## Start services

```bash
# terminal 1 — backend (reads .env via spring-boot-maven-plugin)
cd backend && set -a && . ../.env && set +a && mvn spring-boot:run

# terminal 2 — agent-runtime
cd agent-runtime && pnpm dev
```

## Local Codex operator control

The Java local command handler is `org.openharness.backend.service.provider.CodexOperatorCommand`. A local Gateway launcher constructs it with the active `ProviderConfig` and `CodexProcessSupervisor`, then calls `execute("login"|"status"|"logout", output)`. This task does not add ProviderAdapter wiring, a Frontend login page, or a remote operator endpoint.

Expected delegation:

```text
login   -> codex login
status  -> codex login status
logout  -> codex logout
```

OpenHarness discards official CLI stdout/stderr and reports only fixed non-secret output. Do not replace the invoker with shell evaluation, credential-file reads, or verbatim process-output forwarding.

`status` prints only `providerId`, `readiness`, `processState`, `modelAvailability`, and `needsLogin`. It reports model availability as `available` or `unavailable` and never emits configured model names. A nonzero official status result reports `needsLogin=true`; any non-ready supervisor or empty model allow-list reports unavailable and exits nonzero.

Login recovery sequence:

1. Stop new `openai-codex/*` traffic or leave it fail-closed.
2. Run the local `login` operation through the official Codex surface.
3. Restart or re-check the owned app-server process through the Gateway lifecycle owner.
4. Run local `status`; continue only when readiness is `ready`, process state is `READY`, at least one configured model is available, and `needsLogin=false`.

Logout sequence:

1. Drain or cancel active Codex work through its owning lifecycle before logout.
2. Run the local `logout` operation.
3. Confirm local `status` exits nonzero with `needsLogin=true` or unavailable.
4. Codex routes remain fail-closed until official login is restored. Existing API-key routes are unchanged.

Platform limits:

- Only process-local supervisor state is reported; the command handler does not discover or control an unrelated Gateway process.
- Local stdio/Unix/loopback transports are supported by the approved design; arbitrary remote app-server endpoints remain rejected.
- Real login/logout and real Provider smoke require separate operator authorization. Automated tests use a fake process with synthetic output only.

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
