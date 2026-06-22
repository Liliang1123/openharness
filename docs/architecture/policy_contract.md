# OpenHarness Policy Contract

> 状态：v1 草稿  
> 目的：定义 beforeToolUse、ReviewPolicyService、ask_user、静态/动态 policy 拆分、防绕过校验。

## 1. Principle

```text
policy in prompt = hint
policy in hook = law
```

HITL、审批、权限、合规不得只依赖 prompt。

## 2. Layers

| Layer | Owner | Evaluation |
|---|---|---|
| Org policy | Java source of truth; TS may snapshot | static/dynamic |
| Agent definition policy | Java source of truth; TS may cache per session | static |
| Skill manifest policy | TS loaded skill state | local |
| Caller override | TS ToolContext | local |
| Agent self-invoke | Agent calls ask_user | no policy suppression |

## 3. Endpoint

```text
POST /api/v1/policies/tool-review/evaluate
```

Request:

```json
{
  "requestId": "req-001",
  "conversationId": "conv-001",
  "userId": "user-001",
  "tenantId": "tenant-001",
  "traceId": "trace-001",
  "toolCalls": [
    { "id": "call-001", "name": "submit_artifacts", "argumentsRaw": "{\"amount\":15000}" }
  ],
  "context": {
    "orgId": "tenant-001",
    "agentId": "agent-001",
    "loadedSkills": [
      { "name": "finance-reporter", "requiresApprovalFor": ["submit_artifacts"] }
    ],
    "callerRequireApproval": false,
    "catalogVersion": "v1",
    "catalogHash": "sha256:abc"
  }
}
```

Response:

```json
{
  "requestId": "req-001",
  "conversationId": "conv-001",
  "decisions": [
    {
      "toolCallId": "call-001",
      "decision": "REQUIRE_APPROVAL",
      "source": "ORG_POLICY",
      "reason": "submit_artifacts amount > 10000",
      "reviewerUserId": "reviewer-001",
      "approvalToken": "approval-token-opaque"
    }
  ]
}
```

## 4. Decisions

| decision | TS behavior |
|---|---|
| `ALLOW` | execute tool via Java |
| `DENY` | do not execute; terminate execution with `RuntimeTerminalError=POLICY_DENY` |
| `REQUIRE_APPROVAL` | create `ApprovalStore` pending entry; transition execution to `waiting_approval`; wait for approve/reject/revise |

Batch behavior:

1. Java returns one decision per `toolCallId`.
2. TS executes `ALLOW` decisions.
3. TS emits `tool_result(status="denied")` and terminal `stream_error(errorClass="POLICY_DENY")` for `DENY` decisions.
4. TS creates pending approval only for `REQUIRE_APPROVAL` decisions.
5. `HistoryStore` must not receive raw sentinel strings such as `PENDING_APPROVAL` or `POLICY_DENY`.

## 5. beforeToolUse Flow

```text
assistant tool_calls
  -> TS beforeToolUseNode
  -> local static checks
  -> Java policy evaluate for dynamic checks
  -> ALLOW / DENY / REQUIRE_APPROVAL
```

## 6. Approval Flow

```text
REQUIRE_APPROVAL
  -> ApprovalStore pending keyed by (executionId, toolCallId)
  -> ExecutionState.status = waiting_approval
  -> RuntimeEventStore approval_requested
  -> frontend ApprovalCard
  -> approve: runner resumes original tool execute
  -> reject: runner writes structured rejected tool result and lets the model continue
  -> revise: runner executes the same toolCall with revised arguments
```

Pending storage:

1. Pending approvals are stored by TS Runtime in `ApprovalStore`.
2. JSON persistence lives beside session data, e.g. `data/sessions/{tenantId}/{conversationId}-approvals.json`.
3. `GET /api/v1/sessions/:conversationId` returns `activeExecution` and `pendingApprovals` so refresh can recover ApprovalCard state.
4. Same `(tenantId, conversationId)` may have only one active execution; `waiting_approval` requests return `409 EXECUTION_WAITING_APPROVAL`.
5. `APPROVAL_TIMEOUT_MS` defaults to 3600000 and terminates stale approvals with `APPROVAL_TIMEOUT`.

Decision endpoint:

```text
POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId
```

Request body:

```json
{
  "action": "approve",
  "revisedArguments": {},
  "message": "optional reviewer note"
}
```

The legacy endpoint `POST /api/v1/agent/ask-user/:askUserId/reply` remains during the compatibility window and routes to the same `ApprovalStore` entry when `askUserId` is known.

Approval token:

1. Java policy response may return an opaque `approvalToken` for `REQUIRE_APPROVAL`.
2. TS stores the token in `ApprovalStore.approvalToken`.
3. On approve, TS sends `approvalToken` to Java `/api/v1/tools/execute`.
4. Java validates token tenant/user/conversation/toolCall binding before executing sensitive/destructive tools.

## 7. Snapshot API (P1)

```text
GET /api/v1/policies/snapshot?agentId=<agent-id>
```

Used for static org/agent rules. Dynamic conditions still call evaluate.

## 8. Java Execute Defense

Java `/api/v1/tools/execute` must deny sensitive/destructive tools if:

1. no policy allow record.
2. no completed approval where required.
3. caller identity does not match approval identity.
4. catalogVersion/catalogHash stale.

## 9. MCP Source Default Rule

When `toolCalls[i].source` starts with `"mcp:"`, Java `PolicyService` applies a default rule **before** the catch-all ALLOW:

| Condition | Decision | Source |
|-----------|----------|--------|
| `source` starts with `"mcp:"` and tool/server not in `mcpAllowList` | `REQUIRE_APPROVAL` | `MCP_DEFAULT` |
| `source` starts with `"mcp:"` and tool name or server in `mcpAllowList` | `ALLOW` | `NONE` |
| `source` is `null` / absent (catalog tool) | existing rules apply | — |

`mcpAllowList` is a `List<String>` on `PolicyContext`. Each entry matches either a tool name (e.g. `"safe_tool"`) or a full server source (e.g. `"mcp:trusted-server"`). Configuration entry point is reserved for a future change.

TS Runtime fills `source` from `ToolRegistry.resolveSource()` before calling `evaluatePolicy`. Catalog tools send no `source` field (treated as `null` by Java).

`MCP_REQUIRE_APPROVAL=true` in TS Runtime remains a **hard override** (organization-level forced approval) independent of Java's MCP default rule.

## 10. Untrusted Tool Output Rule

TS Runtime marks each tool-result message with internal `toolResultProvenance`.
When provenance is `untrusted`, TS wraps the model-visible content with:

```text
<tool_output trust="untrusted" tool="<toolName>">
...
</tool_output>
```

These boundaries tell the model that the content is data, not instructions.
The internal `toolResultProvenance` and `toolName` fields are persisted for
runtime policy context, but they are stripped as separate fields before messages
are sent to the model.

Before policy evaluation, TS sends:

```json
{
  "context": {
    "untrustedToolOutputSinceLastUser": true,
    "toolPermissions": {
      "submit_payment": "sensitive"
    }
  }
}
```

When `untrustedToolOutputSinceLastUser=true`, Java policy upgrades
`sensitive` and `destructive` tool calls to `REQUIRE_APPROVAL` with source
`UNTRUSTED_CONTEXT`. Safe/read-only tools keep the existing policy behavior so
the agent can inspect data and recover.

Precedence remains:

1. explicit org deny (`blocked_*`).
2. skill manifest approval.
3. MCP default approval.
4. untrusted context approval.
5. default allow.

## 11. Acceptance Tests

1. default ALLOW executes safe tool.
2. deny rule returns `POLICY_DENY` terminal error.
3. require approval creates `ApprovalStore` pending.
4. approve resumes original pending tool call.
5. reject never executes original tool call.
6. bypass TS direct Java execute for sensitive tool returns 403.
7. batch evaluate returns one decision per toolCallId.
8. batch evaluate with DENY terminates execution with `POLICY_DENY`.
9. approve without valid `approvalToken` returns 403.
10. refresh during pending approval recovers state from `GET /api/v1/sessions/:conversationId`.
11. untrusted tool output before a sensitive/destructive tool call returns `REQUIRE_APPROVAL` with source `UNTRUSTED_CONTEXT`.
