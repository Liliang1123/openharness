# OpenHarness Prompt Contract

> 状态：v1 草稿
> 目的：定义 TS Runtime、Java Backend、Frontend 在 prompt 资产和 system prompt 注入上的职责边界。

## 1. Ownership

| Action | Owner |
|---|---|
| Select prompt template | TS Runtime |
| Prepend system prompt to model-call messages | TS Runtime |
| Preserve `promptId` / `promptVersion` metadata | TS Runtime + Java pass-through |
| Provider-specific message rendering | Java Backend |
| Append or rewrite system prompt bytes | Forbidden in Java and Frontend |

## 2. Prompt Template

```ts
interface PromptTemplate {
  promptId: string;
  version: string;
  role: "system";
  content: string;
  description?: string;
}
```

The default prompt reference is:

```text
openharness-default@v1
```

`OPENHARNESS_PROMPT_REF` MAY select another registered prompt reference. Unknown references MUST fail closed before the Java model gateway is called.

## 3. Model Call Rule

TS Runtime builds model-call messages in this order:

1. versioned system prompt from PromptRegistry;
2. ContextBuilder-selected stable conversation context.

The injected system prompt MUST NOT be appended to `HistoryStore`, `RuntimeEventStore`, `ApprovalStore`, or compression chunks.

## 4. Metadata

Every model request SHOULD carry:

```json
{
  "meta": {
    "promptId": "openharness-default",
    "promptVersion": "v1"
  }
}
```

This metadata is for audit, trace correlation, and rollback. It is not prompt content.

## 5. Policy Boundary

Prompt text may explain tool-use expectations and trust boundaries, but it is not an enforcement mechanism. Authorization, approval, and deny decisions remain enforced by `beforeToolUse` and Java policy evaluation.

## 6. Acceptance Tests

1. Default prompt resolves to `openharness-default@v1`.
2. Unknown prompt refs fail before model call.
3. Java model request starts with a `role: "system"` message.
4. `meta.promptId` and `meta.promptVersion` are present.
5. Stable history does not contain the injected system prompt.
