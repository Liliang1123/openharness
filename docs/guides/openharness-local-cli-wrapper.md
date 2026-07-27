# OpenHarness Local CLI Wrapper Guide

## Current Status

OpenHarness currently ships a working local Runtime stack and internal evaluation/gate command-line entry points, but it does **not** yet publish an official installable `openharness` product CLI package.

For CLI-heavy local trial, use a user-local operator wrapper named `openharness`. The wrapper is an installation convenience around the merged repository services; it is not a stable public product contract.

## Recommended Installation Layout

- Source clone: `~/.local/share/openharness/source`
- Executable: `~/.local/bin/openharness`
- PID/state: `~/.local/state/openharness`
- Logs: `~/.local/state/openharness/logs`
- Configuration remains in the isolated source clone and MUST NOT be printed by the wrapper.

The source clone should be created locally from the merged `main` at [OpenHarness repository](file:///Users/elvis/file/develop/opensource/openharness), so installation does not mutate or clean the user's dirty primary checkout.

## Wrapper Commands

```text
openharness doctor
openharness up
openharness status
openharness logs [backend|runtime|frontend|all]
openharness chat "your message" [conversation-id]
openharness down
```

- `doctor`: verify Git, Node.js, pnpm, Java, Maven, `curl`, free ports, dependencies, and required local configuration.
- `up`: start the existing full local stack in the background, write a supervisor PID, and wait for service readiness.
- `status`: report supervisor/process state and service health without exposing secrets.
- `logs`: follow one or all service logs.
- `chat`: call the existing Runtime basic-chat endpoint with generated request/trace IDs and safe local defaults.
- `down`: terminate the recorded supervisor process gracefully, wait for children, and remove only wrapper-owned PID files.

## Safety Contract

- Never run `git reset`, `git clean`, or delete files in [the primary checkout](file:///Users/elvis/file/develop/opensource/openharness).
- Never embed or print OAuth tokens, API keys, service tokens, or `.env` values.
- Never kill processes by broad name matching; stop only the wrapper-owned PID tree.
- Refuse `up` if a live wrapper PID exists or required ports belong to another process.
- Keep `chat` headers and endpoint aligned with the repository's current README and Runtime API.
- Run `doctor` after every source update.

## Future Product Work

An official distributable CLI, stable command contract, package publishing, upgrade channel, shell completion, richer terminal UX, and credential management require a separate OpenSpec change. This local wrapper intentionally does not pre-decide those product semantics.
