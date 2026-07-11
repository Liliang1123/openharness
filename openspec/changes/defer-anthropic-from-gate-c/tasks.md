## 1. Approval

- [x] 1.1 Review and explicitly approve this OpenSpec change (user approved product decision 2026-07-09; formal written proposal approved as option **A** in session).
- [x] 1.2 Confirm sibling ChatGPT OAuth work stays on `add-chatgpt-oauth-auth` and is not mixed into Gate C demotion tasks.

## 2. Contract Alignment (after approval)

- [x] 2.1 Update active change `harden-agent-runtime-single-node-production` proposal/design/provider-adapter delta so Gate C required family is OpenAI-compatible only and Anthropic is deferred.
- [x] 2.2 Update active tasks: mark 3.2 as deferred/post-Gate-C; keep 3.1 as Gate C required OpenAI-compatible real matrix.
- [x] 2.3 Update Stage 0 Superpowers plan Gate C checklist and production runbook wording to match.
- [x] 2.4 Update dashboard notes for `harden-agent-runtime-single-node-production` to record the demotion decision and date.

## 3. Qualification Rules

- [x] 3.1 Ensure report promotion / matrix harness treats missing Anthropic credentials as deferred (non-blocking for Gate C), not as required blocked overall.
  - Verified: OpenAI-compatible and Anthropic matrices are separate reports; no combined dual-family Gate C aggregator hard-requires both families in code. Gate C policy is contract/docs driven.
- [x] 3.2 Ensure OpenAI-compatible required row `fail`/`blocked` still vetoes Gate C overall PASS (unchanged required-row veto semantics; restated in updated provider-adapter delta and plan).
- [x] 3.3 Add or adjust tests covering dual-family-optional Gate C aggregation if harness currently hard-requires both families.
  - No code change required: harness does not hard-require dual-family overall PASS for Gate C promotion; local dual reports remain independent `local_verified` fixtures.
- [x] 3.4 Document how a future Anthropic real matrix is labeled when run (supporting / deferred family promotion), without rewriting historical OpenAI-compatible evidence (runbook + design + tasks 3.2 wording).

## 4. Verification

- [x] 4.1 `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive`
- [x] 4.2 `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` after alignment edits
- [ ] 4.3 Focused qualification/report tests green (optional smoke; no harness code change this batch)
- [x] 4.4 Review note confirming Gate C still cannot close until OpenAI-compatible real matrix required rows pass
