## 1. Proposal and preflight

- [x] 1.1 Obtain explicit approval for `refactor-gate-closure-evidence-scope` and the extraction strategy.
- [x] 1.2 Create a dated preflight Review under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/) covering the two-file scope ledger, scanner dependency inventory, and proposed v22 allowlist; do not modify the v21 evidence.
- [x] 1.3 Create the approved Superpowers implementation plan only after the OpenSpec proposal and preflight Review are approved.

## 2. Test-scope partition

- [x] 2.1 Classify every changed test block in [mcpRegistry.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts) and [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts) as correction-only, unrelated functionality, shared helper, or dependency.
- [x] 2.2 Extract two self-contained correction-only `*.correction.test.ts` artifacts with only approved assertions, fixtures, and imports; leave the original dirty files and unrelated blocks untouched and outside the candidate.
- [x] 2.3 Add governance tests for the scope ledger and for rejection of accidental whole-file or out-of-scope additions.

## 3. Manifest, closure, and scanner dependency contract

- [x] 3.1 Add the two correction-only artifacts as canonical closure entrypoints and recompute the complete import/fixture/config closure.
- [x] 3.2 Inventory every sensitive-literal fixture-rule dependency from the scanner, reconcile the exact set with closure, and add a provenance row for every declared dependency; do not hard-code an unmanifested cross-scope path.
- [x] 3.3 Version the machine manifest schema and human manifest binding for the explicit secret-scan dependency set, then regenerate hashes, modes, source bindings, and current-required rows from the new candidate commit.
- [x] 3.4 Update closure and provenance verifiers to reject missing, duplicate, unbound, or out-of-closure scanner dependencies and to report exact numeric counts.
- [x] 3.5 Update the scanner to read candidate content through the provenance contract, preserve no-secret-output/fail-closed semantics, and add clean-tree/dirty-tree reproducibility regression coverage.

## 4. Fresh allowlist and execution

- [x] 4.1 Publish a fresh v22-or-later allowlist with a new anchor, exact command strings, roles/phases/counts, numeric exit-status expectations, and the one-time scope diagnostic.
- [x] 4.2 Obtain fresh staging/commit confirmation after the new file scope and C39/C48 baseline treatment are reviewed; the user explicitly accepted `BLOCKED_BASELINE` and authorized exact-path staging/commit. Stage only the reviewed allowlist paths.
- [ ] 4.3 Run the fresh exact C23-C51 sequence under the new allowlist. Do not rerun v21 C31 or relabel its failure.
- [x] 4.4 Keep dashboard state `partial`, OpenSpec changes active, and all real credential/provider/MCP/browser calls, promotion, archive, and push disabled.

## 5. Independent PIR and closeout

- [x] 5.1 Dispatch a reviewer with a distinct verifiable session identity for the implementation candidate; reviewer checked locked closure, provenance, scanner dependency binding, correction-only scope, and allowlist risks. A separate post-execution PIR remains pending.
- [ ] 5.2 Run the independent PIR after the fresh C23-C51 sequence, including the explicitly accepted C39/C48 `BLOCKED_BASELINE` mode; record the result as blocked/需修改 when reproduced and do not claim completion.
- [x] 5.3 Update the dashboard source and generated outputs only at the governed proposed synchronization point; do not mark the existing product change promoted or archived.
