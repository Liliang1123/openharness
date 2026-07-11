# Change: Defer Anthropic From Gate C Required Matrix

## Why

Stage 0 / Gate C currently requires **both** OpenAI-compatible and Anthropic real-provider matrices before production promotion. Operators already have a usable OpenAI-compatible production path (for example Zhipu `glm-4-flash`) and have explicitly approved demoting Anthropic from the **required** Gate C set.

Keeping Anthropic as a hard Gate C blocker freezes single-node production closeout on a credential family that is not available and is not needed for the immediate OpenAI-compatible production evidence path. Anthropic adapter code and local/fake matrices remain valuable and must stay implementable, but real Anthropic credentials must not veto Gate C.

User decision (2026-07-09): **拍板** — Anthropic real-provider matrix is deferred / post-Gate-C; Gate C may promote on OpenAI-compatible real matrix alone (subject to all other Gate C rows and security gates).

## What Changes

### Gate C provider-family scope

- Gate C **required** real-provider family becomes **OpenAI-compatible only**.
- Anthropic real-provider qualification is **deferred**: missing Anthropic credentials MUST NOT block Gate C overall PASS.
- Anthropic remains an in-tree adapter capability; local/fake Anthropic matrix evidence may still run as supporting evidence.
- When Anthropic credentials later exist, a deferred real matrix MAY run and promote Anthropic as an additional qualified family, without reopening the OpenAI-compatible Gate C contract unless that contract itself changes.

### Alignment of active Stage 0 change

After this proposal is approved, amend the active change
`harden-agent-runtime-single-node-production` so that:

- Task **3.2** is marked deferred / post-Gate-C (not a Gate C blocker).
- Design / proposal wording that requires dual-family real matrices for Gate C is updated to OpenAI-compatible-only.
- Provider-adapter production qualification delta matches this change.
- Superpowers Stage 0 plan Gate C checklist is updated accordingly.
- Dashboard notes for the active production change reflect the new Gate C scope.

### Explicit non-substitutions

- Zhipu / other OpenAI-compatible providers still do **not** prove Anthropic Messages semantics.
- This change only removes Anthropic from **Gate C required**; it does not delete `AnthropicAdapter` or local Anthropic tests.
- ChatGPT OAuth (subscription auth) is **out of scope** here; see sibling change `add-chatgpt-oauth-auth`.

## Impact

### Affected specs

- `provider-adapter`: Gate C real-provider family scope and deferred Anthropic real matrix.
- Indirect docs/tasks for `harden-agent-runtime-single-node-production` (after approval only).

### Affected implementation areas

- No runtime behavior change required for adapter call paths.
- Qualification harness / promotion rules / Stage 0 tasks / plan / runbook / dashboard notes.
- Possibly report aggregator oracles if they hard-code dual-family required sets.

### Breaking and migration considerations

- Prior Gate C wording that demanded Anthropic real matrix is superseded for single-node v1 closeout.
- Existing Anthropic fake/local matrix artifacts remain valid as non-blocking evidence.
- Operators with Anthropic keys may still run the deferred matrix voluntarily.

## Risk

Standard. Scope is primarily qualification-policy and documentation alignment. Risk is under-qualifying Anthropic if later production traffic depends on Anthropic Messages without running the deferred matrix — mitigated by keeping Anthropic adapter tests, documenting deferred status, and requiring a real Anthropic matrix before declaring Anthropic production-qualified.

## Delivery Profile

- Evidence profile: `compact` (policy/docs/harness gate rules; no provider protocol rewrite).
- Batch profile: `single`.

## Non-Goals

- Implementing ChatGPT / Codex OAuth.
- Removing Anthropic adapter or Anthropic fake matrix tests.
- Closing Gate C automatically (OpenAI-compatible real matrix must still pass all required rows).
- Closing Gate B / Gate D or archiving Stage 0.
- Changing sandbox / MCP qualification scope.
