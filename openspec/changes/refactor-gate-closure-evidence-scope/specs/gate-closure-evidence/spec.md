## ADDED Requirements

### Requirement: Correction-only test scope is explicit

The gate-closure evidence process SHALL represent correction-only content from the two dirty Agent Runtime tests as independently reviewable test artifacts, with each included test, helper, fixture, and import classified in a scope ledger. Unrelated functional-test changes SHALL remain outside the correction candidate and its allowlist.

#### Scenario: Whole-file scope is rejected

- **WHEN** a candidate includes the complete dirty version of either named test without a correction-only partition
- **THEN** the scope review SHALL reject the candidate before staging and SHALL identify the unreviewed functional content

#### Scenario: Correction-only artifact is accepted

- **WHEN** a dedicated correction-only test artifact contains only ledger-approved assertions, fixtures, helpers, and imports
- **THEN** the artifact SHALL be eligible for closure entrypoint review and every dependency SHALL be bound to a provenance row

### Requirement: Locked closure and provenance cover scanner dependencies

The locked candidate closure SHALL contain the canonical correction entrypoints, their transitive local dependencies, non-TypeScript boundaries, and every path declared by the secret-scan dependency set. The machine manifest and human manifest SHALL contain exactly one matching provenance row for every locked closure path.

#### Scenario: Missing dependency row fails closed

- **WHEN** a secret-scan dependency is absent from the locked closure or has no matching provenance row
- **THEN** the closure or provenance verifier SHALL exit non-zero and SHALL NOT report `closure=locked` or provenance success

#### Scenario: Fresh lock is reproducible

- **WHEN** the new candidate commit is inspected in a clean worktree
- **THEN** the closure, manifest paths, source/current hashes, modes, and row counts SHALL agree mechanically and the verifier SHALL report the exact counts

### Requirement: Secret-scan fixture expectations are provenance-managed

The secret scanner SHALL consume an explicit, manifest-bound dependency set for sensitive-literal fixture expectations. For each dependency, the scanner SHALL use the pinned source content unless the provenance row explicitly requires the reviewed current content. It SHALL remain fail-closed and SHALL not depend on unrelated dirty copies in the main worktree.

#### Scenario: Clean and dirty candidates agree

- **WHEN** unrelated files or out-of-scope versions of the original tests are dirty in the main worktree
- **THEN** scanning the same provenance candidate SHALL produce the same result as the clean candidate, without reading unbound dirty fixture content

#### Scenario: Unbound fixture rule is rejected

- **WHEN** the scanner contains a fixture expectation whose path is not in the declared dependency set and manifest closure
- **THEN** the scanner governance check SHALL exit non-zero without printing secret literals

### Requirement: Scope changes use a fresh allowlist and evidence identity

Any change to correction paths, closure entrypoints, scanner dependencies, command text, role, phase, or invocation count SHALL require a new versioned allowlist and fresh anchor. The prior allowlist's consumed commands SHALL remain immutable.

#### Scenario: Prior C31 cannot be reused

- **WHEN** the v21 C31 command has already been executed and the candidate scope changes
- **THEN** the new run SHALL use a fresh allowlist/anchor and SHALL not relabel or rerun the v21 C31 evidence

#### Scenario: Independent PIR is required

- **WHEN** fresh C23-C51 execution completes
- **THEN** a reviewer with a distinct verifiable session identity SHALL independently check locked closure, provenance, scanner dependencies, and workspace evidence before a PIR conclusion

### Requirement: External side effects remain disabled

This governance change SHALL not authorize credential reads, real provider/MCP/browser calls, promotion, OpenSpec archive, or push.

#### Scenario: Local-only verification

- **WHEN** the scope, manifest, scanner, and allowlist changes are validated
- **THEN** verification SHALL use local deterministic commands only and SHALL leave the dashboard partial and OpenSpec changes active
