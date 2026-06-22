## ADDED Requirements

### Requirement: Memory Fact Schema
The shared schema package SHALL define a Zod schema for long-term memory facts.

#### Scenario: Parse a valid memory fact
- **GIVEN** a memory fact containing IDs, scope, content, tags, and timestamps
- **WHEN** it is parsed by the shared schema
- **THEN** the parsed value preserves the memory metadata

### Requirement: Eval Case Schema
The shared schema package SHALL define a Zod schema for eval replay cases.

#### Scenario: Parse a valid eval case
- **GIVEN** an eval case containing scope, conversation ID, input, and expected answer criteria
- **WHEN** it is parsed by the shared schema
- **THEN** the parsed value preserves replay criteria
