# Task 9 Qualification Schema And Redaction Evidence

Date: 2026-07-06

Status: `local_verified` for the shared qualification report contract and standalone Runtime/Java redaction boundaries. This evidence does not authorize real Provider credentials, production cutover, or production promotion.

## Scope

- [Shared qualification schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/test/schema.test.ts)
- [Runtime redactor](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/qualification/redaction.ts)
- [Runtime redactor tests](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/qualificationRedaction.test.ts)
- [Java redactor](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/QualificationRedactor.java)
- [Java redactor tests](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/QualificationRedactorTest.java)

## TDD Evidence

- Shared schema RED: 3 tests failed because qualification schemas were absent.
- Shared schema GREEN: 46 tests passed; typecheck passed.
- Runtime redactor RED: focused suite failed because the redaction module was absent.
- Runtime redactor GREEN: 2 tests passed; Runtime typecheck passed.
- Java redactor RED: test compilation failed because `QualificationRedactor` was absent.
- Java redactor GREEN: 2 tests passed with no failures or errors.

## Formal Verification

- `pnpm test`: shared-schema 46, Runtime 289, Frontend 24, integration 17 tests passed. Runtime listener tests required execution outside the filesystem/network sandbox because sandbox loopback bind returned `EPERM`.
- `pnpm typecheck`: shared-schema, Runtime, and Frontend passed.
- `mvn -f backend/pom.xml test`: 30 tests passed outside the sandbox; the sandbox run could not initialize Mockito's Byte Buddy self-attach mechanism.
- `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`: valid; the known PostHog DNS warning did not affect exit status.
- `pnpm dashboard:check`: generated outputs current.
- `git diff --check`: passed.
- Production-source secret-canary scan: no fixture secret appears in Runtime, Backend, or shared-schema production sources. Test fixtures intentionally retain synthetic canaries; an older Stage 1 evidence line names its historical test fixture.

## Contract Evidence

- Every qualification row requires `track: local | production` and the fixed environment/protocol/capability/request/oracle/result fields.
- Report and row tracks must match.
- A required `blocked` or `fail` row prevents overall `pass`.
- Runtime and Java redactors return sanitized copies, recursively redact secret keys and secret-bearing strings, and preserve ordinary non-secret structure.

## Residual Boundary

Task 9 establishes standalone redaction primitives. Integration into concrete Provider, tool, trace, file-report, and CLI sinks is verified as each local Task 10/11 harness is added. Gate B remains `pending_production_evidence`.
