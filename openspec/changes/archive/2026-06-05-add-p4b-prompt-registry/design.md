## Context
TS Runtime owns model-call message assembly and harness state. Java owns provider adapters and must not append or rewrite system prompt bytes. A prompt registry gives TS a deterministic, auditable prompt asset layer while keeping provider credentials and rendering in Java.

## Goals
- Provide a default versioned system prompt for all model calls.
- Keep prompt selection deterministic and observable through `meta.promptId` and `meta.promptVersion`.
- Ensure system prompt messages are transient model-call input only and do not enter `HistoryStore`.
- Preserve Java's role as provider adapter without prompt mutation.

## Non-Goals
- No YAML agent definition DSL.
- No prompt file watcher.
- No A/B experiment engine.
- No tool description few-shot enrichment.

## Decisions
- Decision: Prompt registry lives under `agent-runtime/src/prompts` because TS Runtime owns harness prompt assembly.
- Decision: Initial registry is in-code and immutable at process runtime.
- Decision: `OPENHARNESS_PROMPT_REF` can select `promptId@version`; default is `openharness-default@v1`.
- Decision: The system prompt is prepended to selected ContextBuilder messages immediately before calling Java.

## Risks / Trade-offs
- In-code prompts are less operator-friendly than file-backed prompts. Mitigation: keep the registry API narrow so a later file-backed loader can replace the source.
- Prompt text can influence agent behavior but must not enforce policy. Mitigation: docs state policy in prompt is hint; hook policy remains law.
