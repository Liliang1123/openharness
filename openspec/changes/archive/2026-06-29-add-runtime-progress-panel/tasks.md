## 1. Proposal Gate
- [x] 1.1 Review and approve this OpenSpec change before implementation.

## 2. Shared Schema
- [x] 2.1 Add `RuntimeProgressSnapshotSchema` and related enums/types to `packages/shared-schema`.
- [x] 2.2 Add schema tests for valid snapshots, activity/status enums, and sensitive-field exclusion expectations.

## 3. Agent Runtime
- [x] 3.1 Add a runtime progress derivation helper that builds snapshots from `RuntimeEventStore` events and `ExecutionStateStore`.
- [x] 3.2 Include `runtimeProgress` in `GET /api/v1/sessions/:conversationId` when an active or recent execution is available.
- [x] 3.3 Add focused runtime tests for running, waiting approval, subagent, completed, and errored progress snapshots.

## 4. Frontend
- [x] 4.1 Add `RuntimeProgressPanel` to render status, current step, active operation, approval wait state, terminal reason, and elapsed time.
- [x] 4.2 Wire live stream events and session detail recovery into the panel without removing the existing Trace Tree panel.
- [x] 4.3 Add frontend tests for running, waiting approval, completed, and errored display states.

## 5. Verification
- [x] 5.1 Run shared-schema focused tests.
- [x] 5.2 Run agent-runtime focused tests and typecheck.
- [x] 5.3 Run frontend focused tests and typecheck.
- [x] 5.4 Run `npx openspec validate add-runtime-progress-panel --strict --no-interactive`.
- [x] 5.5 After implementation is verified, sync the development dashboard to `verified`.
