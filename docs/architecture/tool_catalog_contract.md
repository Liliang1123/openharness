# OpenHarness Tool Catalog Contract

> 状态：v1 草稿  
> 目的：定义 Java Tool Catalog、TS ToolRegistry 冻结、版本协商和权限元数据。

## 1. Endpoint

```text
GET /api/v1/tools/catalog?agentId=<agent-id>
```

Required headers:

```text
Authorization
X-User-Id
X-Tenant-Id
X-Trace-Id
X-Request-Id
```

## 2. Response

```json
{
  "catalogVersion": "2026-05-19T10:00:00Z",
  "catalogHash": "sha256:abc",
  "tools": [
    {
      "name": "get_current_time",
      "description": "Get current time by timezone",
      "parameters": {
        "type": "object",
        "properties": {
          "timezone": { "type": "string" }
        },
        "required": ["timezone"]
      },
      "permission": "safe",
      "isReadOnly": true,
      "isDestructive": false,
      "requiresApproval": false,
      "isConcurrencySafe": true,
      "protocol": "read_file"
    }
  ]
}
```

## 3. Semantics

| 字段 | 含义 |
|---|---|
| `catalogVersion` | Java catalog 版本，TS session 内冻结 |
| `catalogHash` | catalog 内容 hash，execute 时校验 |
| `permission` | `safe/sensitive/destructive` |
| `isReadOnly` | 读操作，可用于 auto-approve |
| `isDestructive` | 破坏性操作，默认需要 policy/human review |
| `requiresApproval` | 工具天生需要审批的静态 hint，不等于 caller override |
| `isConcurrencySafe` | 是否可并发执行 |
| `protocol` | 可选 Harness protocol tool 标识，当前允许 `read_file/search/run_command/edit_file` |

## 4. TS ToolRegistry Rules

1. Session start fetches catalog once.
2. Tool schema freezes for that session.
3. Policy/forbidden tools must not remove schema; use hook deny.
4. Tool aliases are TS-local and map to canonical catalog names.
5. Skills are not individual catalog tools; use `invoke_skill` meta tool.

Session definition:

```text
catalog freeze scope = one (tenantId, conversationId) lifecycle
```

同一 `conversationId` 内不得静默切换 catalog；跨 `conversationId` 必须重新 fetch catalog。

## 5. Java Execute Validation

`POST /api/v1/tools/execute` must validate:

1. tool exists.
2. catalogVersion/catalogHash match current effective catalog.
3. user/tenant/agent still permitted.
4. policy allows or approval completed.
5. idempotency key is valid.

Mismatch:

```json
{
  "error": {
    "errorClass": "CATALOG_OUTDATED",
    "errorMessage": "Tool catalog changed; refresh session.",
    "retriable": false
  }
}
```

Recovery:

1. TS 收到 `CATALOG_OUTDATED` 后自动 refresh catalog 一次。
2. 如果同一 tool name 仍存在且 schema 兼容，TS 可用新 `catalogVersion/catalogHash` retry 一次。
3. 如果仍 stale 或 schema 不兼容，TS 停止本轮并提示用户开新会话或重试。

## 6. Per-user Filtering

Catalog is filtered by:

1. tenant.
2. user roles.
3. agent profile.
4. environment.
5. enabled integrations.

TS must not assume two users see the same catalog.

## 7. Tool Result Provenance

Tool execution responses may include:

```json
{
  "provenance": "trusted"
}
```

Allowed values:

| value | meaning |
|---|---|
| `trusted` | Data is produced by a trusted catalog tool or explicitly trusted integration. |
| `untrusted` | Data comes from an external or untrusted source and must be treated as data, not instructions. |

Java catalog tools default to `trusted` when the field is absent. MCP tools
default to `untrusted` in TS Runtime unless a future trusted registry explicitly
overrides that classification.

TS Runtime stores provenance in internal tool-message metadata and wraps
untrusted output before sending it back to the model. Java Policy uses the
derived runtime context to require approval before sensitive/destructive tools.

## 8. Protocol Tools

Protocol tools are harness-level tools exposed through the normal Java catalog and executed through `POST /api/v1/tools/execute`.

Current executable protocol tools:

| Tool | protocol | Permission | Semantics |
|---|---|---|---|
| `read_file` | `read_file` | `safe` | Reads a UTF-8 file under `TOOL_WORKSPACE_DIR`, returns capped content and `truncated`. |
| `search` | `search` | `safe` | Performs literal search under `TOOL_WORKSPACE_DIR`, returns bounded `{path,line,text}` matches. |
| `run_command` | `run_command` | `safe` | Runs allow-listed commands without shell evaluation; current allow-list is `echo` and `pwd`. |

Reserved future protocol:

| Tool | protocol | Status |
|---|---|---|
| `edit_file` | `edit_file` | Reserved for a future write-capable change; not executable in this change. |

Protocol execution rules:

1. Paths MUST resolve inside `TOOL_WORKSPACE_DIR`; path escape is `TOOL_USER_ERROR`.
2. Command execution MUST NOT use shell evaluation.
3. Command output MUST be capped.
4. Protocol tools MUST return standard `ToolCallResponse`.

## 9. Acceptance Tests

1. same user/session receives stable catalogVersion.
2. different user may receive different catalog.
3. execute with stale catalog returns 409.
4. forbidden tool remains in schema but beforeToolUse denies it.
5. skill does not create a new tool schema entry.
6. runtime permission revoked after catalog freeze -> Java execute returns `TOOL_PERMISSION_DENY`, TS emits model-visible degraded result.
7. catalog stale -> TS refreshes once and retries once; second stale stops the turn.
8. untrusted tool result followed by sensitive/destructive tool intent triggers policy approval before execution.
9. protocol tools appear with `protocol` metadata and execute through the standard endpoint with bounded output.
