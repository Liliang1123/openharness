# Design: Defer Anthropic From Gate C Required Matrix

## Context

Active change `harden-agent-runtime-single-node-production` originally required dual real-provider families for Gate C:

1. OpenAI-compatible Chat Completions
2. Anthropic Messages

2026-07-09 production evidence on Zhipu proved OpenAI-compatible sync/stream/tool/usage paths can run with real credentials, while Anthropic has no available key. User approved demoting Anthropic from Gate C required.

## Decision

| Item | Decision |
|---|---|
| Gate C required provider family | OpenAI-compatible only |
| Anthropic real matrix | Deferred / post-Gate-C |
| Anthropic adapter + fake/local matrix | Keep |
| Missing Anthropic credential | MUST NOT set Gate C overall to blocked solely for Anthropic absence |
| OpenAI-compatible required row fail/blocked | Still vetoes Gate C PASS |
| Promotion label for Anthropic | Only after deferred real matrix passes; never auto-inferred from Zhipu |

## Rationale

- Gate C exists to prove the **production provider path operators will actually use**.
- Dual-family was a product ambition, not a hard dependency of single-node SQLite/runtime closeout.
- Blocking closeout on unavailable Anthropic credentials creates false process pressure and encourages unsafe workarounds.
- Keeping Anthropic deferred preserves future multi-family qualification without rewriting the adapter stack.

## Relationship to active Stage 0 change

This change is a **policy amendment** of Gate C scope for the still-open Stage 0 production change. After approval:

1. Update `harden-agent-runtime-single-node-production` proposal/design/tasks/spec delta language.
2. Update Stage 0 Superpowers plan Gate C checklist.
3. Keep Stage 0 archive blocked until remaining Gate C OpenAI-compatible evidence and other gates pass.

Do not archive either change merely because Anthropic was deferred.

## Qualification semantics

```text
Gate C PASS requires:
  - OpenAI-compatible real matrix overall PASS (no required row fail/blocked)
  - Java sandbox real matrix already satisfied (existing Stage 2 tasks)
  - MCP real matrix already satisfied (existing Stage 2 tasks)
  - Secret redaction / canary gates clean
  - Human promotion approval

Gate C does NOT require:
  - Anthropic real matrix PASS
  - Anthropic credentials present
```

If a combined multi-family report still lists Anthropic rows, those rows MUST be tagged `deferred` or omitted from the Gate C required set — never silently skipped as PASS.

## Alternatives considered

1. **Keep dual-family required** — rejected; no Anthropic key, user demotion approval.
2. **Delete Anthropic adapter** — rejected; still useful and already implemented.
3. **Accept Zhipu as proof of Anthropic** — rejected; different protocol/family.
4. **Mark Gate C blocked forever without Anthropic** — rejected; blocks single-node v1 for the wrong reason.

## Security

No new credential surfaces. Redaction requirements unchanged. Deferred Anthropic does not weaken API-key redaction for OpenAI-compatible paths.
