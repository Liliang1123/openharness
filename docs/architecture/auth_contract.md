# OpenHarness Auth Contract

> 状态：v1 草稿  
> 范围：Frontend -> TS、TS -> Java、Java -> Provider 的身份、授权、key 隔离。

## 1. Trust Boundary

```text
Browser/Frontend = untrusted client
TS Agent Runtime = trusted application runtime
Java Backend = enterprise trusted gateway
LLM Provider / Business Systems = external or internal protected systems
```

## 2. Frontend -> TS

P0a 可使用 dev header/session mock：

```text
X-User-Id: user-001
X-Tenant-Id: tenant-001
```

P1 必须切换：

1. JWT 或 session cookie。
2. TS 从 token/session 解析 `userId/tenantId`。
3. 前端不得自行伪造 identity headers。

会话隔离：

1. `conversationId` 只在租户内唯一。
2. 所有持久化、trace、幂等和审批记录必须以 `(tenantId, conversationId)` 作为联合边界。
3. 两个租户使用同一 `conversationId` 时，Java 和 TS 必须视为两个完全不同的会话。

## 3. TS -> Java

所有 `/api/v1/**` 非 health 请求必须带：

```text
Authorization: Bearer <service-token>
X-Trace-Id: <trace-id>
X-Request-Id: <request-id>
X-User-Id: <user-id>
X-Tenant-Id: <tenant-id>
X-Agent-Id: <agent-id optional>
```

认证方式：

| 阶段 | 方式 |
|---|---|
| P0a/P0b dev | static service token from env |
| P1 staging/prod | mTLS or signed service JWT |
| P2 enterprise | mTLS + service identity + policy engine |

P1 起 service token / service JWT 必须支持轮转：

1. Java 同时接受 active token 和上一版 grace token。
2. grace window 默认不超过 24h。
3. token 轮转事件必须写 audit。

Java 校验失败：

| 缺失项 | 响应 |
|---|---|
| Authorization missing/invalid | `401 AUTH_SERVICE_TOKEN_INVALID` |
| X-User-Id missing | `401 AUTH_MISSING_HEADER` |
| X-Tenant-Id missing | `401 AUTH_MISSING_HEADER` |
| X-Trace-Id missing | `401 AUTH_MISSING_HEADER` |
| user not allowed for tenant | `403 AUTH_TENANT_FORBIDDEN` |

## 4. Provider API Key Isolation

1. Provider API key 只存在 Java Backend。
2. TS Runtime 永远不读取、不缓存、不打印 provider API key。
3. Frontend 永远不接触 provider API key。
4. Java 根据 `X-Tenant-Id` 从 key vault/config 选择 provider credential。
5. BYOK 属于 Java 侧配置和审计范围。

## 5. Tool Permission

Java `/api/v1/tools/execute` 必须：

1. 验证 service token。
2. 验证 user/tenant/agent 权限。
3. 验证 tool catalog 权限。
4. 验证 policy allow record 或安全工具 allow。
5. 对敏感工具拒绝绕过 TS 的直接调用。

权限执行语义：

| permission | policy evaluate 要求 | execute 要求 |
|---|---|---|
| `safe` | 可由 TS 本地默认 ALLOW 短路，但必须产生等价 trace decision | Java 可在无 approvalToken 时执行，但仍校验身份/catalog |
| `sensitive` | 必须调用 Java `/api/v1/policies/tool-review/evaluate` | 必须有 policy allow record 或有效 approvalToken |
| `destructive` | 必须调用 Java `/api/v1/policies/tool-review/evaluate`，通常 REQUIRE_APPROVAL | 必须有有效 approvalToken |

## 6. Audit Requirements

所有 auth/policy 失败都必须写 audit event：

```text
AUTH_DENY
AUTH_MISSING_HEADER
AUTH_TENANT_FORBIDDEN
POLICY_DENY
TOOL_PERMISSION_DENY
```

audit event 不记录 secret/token 明文。

## 7. Dev Defaults

`.env.example`：

```env
OPENHARNESS_SERVICE_TOKEN=dev-service-token
OPENHARNESS_DEV_USER_ID=user-001
OPENHARNESS_DEV_TENANT_ID=tenant-001
MODEL_PROVIDER=mock
```

## 8. Codex OAuth Operator Boundary

ChatGPT/Codex OAuth credentials remain owned by the official local Codex CLI/app. The Java Gateway local operator command surface delegates only these operations:

- `login` -> `codex login`
- `status` -> `codex login status`
- `logout` -> `codex logout`

OpenHarness MUST NOT read credential files, import tokens, receive authorization codes, or copy child-process output into logs, traces, HTTP responses, or command output. The official process output and error streams are discarded by the OpenHarness command invoker.

The OpenHarness `status` response is generated from the official command exit status, the Java process-supervisor snapshot, and the configured model allow-list. It contains exactly these fields:

```text
providerId=<provider id>
readiness=<ready|unavailable>
processState=<STOPPED|STARTING|READY|DEGRADED|UNAVAILABLE|SHUTDOWN>
modelAvailability=<available|unavailable>
needsLogin=<true|false>
```

The operator surface is local-only. It is not exposed through Frontend, TS Runtime, or an unauthenticated HTTP endpoint. A nonzero official status result or a non-ready supervisor fails closed; it never enables an API-key or mock fallback.
