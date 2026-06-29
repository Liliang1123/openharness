## ADDED Requirements
### Requirement: Runtime Progress Snapshot Schema
The shared schema SHALL define `RuntimeProgressSnapshot` as a safe frontend-consumable projection of one agent execution's progress. The snapshot SHALL include identifiers, execution status, timing fields, loop counters, current activity, optional safe activity details, and a bounded list of recent safe events. The schema MUST NOT require or expose prompt content, skill content, tool output bodies, full tool arguments, authorization headers, or provider credentials.

#### Scenario: Parse active progress snapshot
- **WHEN** zod parses a runtime progress snapshot for a `running` execution with `currentActivity: "model_call"` and `currentStep: 2`
- **THEN** parsing succeeds and preserves identifiers, status, timing, counters, and activity fields

#### Scenario: Reject invalid progress status
- **WHEN** zod parses a runtime progress snapshot with status `paused_unknown`
- **THEN** parsing fails

#### Scenario: Snapshot does not carry sensitive payload fields
- **WHEN** a runtime progress snapshot is produced for frontend display
- **THEN** it contains safe metadata such as event names, step indexes, tool names, skill names, execution IDs, statuses, timing, and terminal class
- **AND** it does not contain prompt content, skill markdown content, tool output bodies, full tool arguments, authorization headers, or provider credentials
