# Task 8 JSON Import Restore Rehearsal

Date: 2026-07-06

Status: fixture-level rehearsal passed; human Gate B remains pending. No real production SQLite cutover write was authorized or performed.

## Scope

- Importer source: [jsonImporter.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/jsonImporter.ts)
- Importer tests: [jsonImporter.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/jsonImporter.test.ts)
- Gate B evidence: [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- Implementation plan: [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## Rehearsal Record

- Backup RPO: source JSON files are hashed before any SQLite import write; the generated backup manifest records source path and SHA-256 for each imported or quarantined file.
- Import counts: focused fixture import observed 1 conversation, 2 stable messages, and 1 memory fact imported.
- Idempotency: rerunning the same fixture import preserved the same SQLite row counts and did not duplicate messages or memory facts.
- Quarantine decision: malformed JSON, path/body scope mismatch, missing history owner mapping, and secret-bearing wrong-scope memory input were quarantined. The quarantine manifest stores only path, SHA-256, and error.
- Secret hygiene: the quarantine manifest did not contain the secret canary fixture or raw message/memory content.
- Pre-cutover restore rehearsal: because backup manifests are written before SQLite import and no production cutover marker is accepted automatically, restoring the pre-cutover JSON source remains the supported abort path before first real SQLite write. Fixture-level restore RTO target is within the approved <=30 minute gate; production RTO measurement still requires human Gate B rehearsal on the real backup artifact.
- Post-cutover forward-fix rehearsal: after the first SQLite import write, the importer writes a `forward_fix_only` cutover marker and reports `legacyWritesAllowed=false`; rollback to old JSON binary writes is therefore blocked by the marker contract.

## Verification Commands

```bash
pnpm --filter @openharness/agent-runtime test -- jsonImporter
pnpm --filter @openharness/agent-runtime test -- jsonImporter migration crashMatrix
pnpm --filter @openharness/agent-runtime typecheck
```

Observed result: all commands passed on 2026-07-06.

## Gate B Status

Human Gate B is not signed. A real cutover still requires human acceptance of the evidence bundle, including the production backup manifest, import report, quarantine decision, restore output, and forward-fix-only marker.
