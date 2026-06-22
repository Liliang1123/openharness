# agent-loop Specification Deltas

## ADDED Requirements

### Requirement: Agent runtime SHALL intercept invoke_skill tool call and support deferred injection

The Agent Runtime MUST intercept the metadata tool call named `invoke_skill`. When intercepted, the runtime:
1. Validates the signature and permissions using the gateway's `beforeToolUse`.
2. Resolves the skill's content from storage.
3. If `fork_agent` is false, pushes the skill to a pending queue and returns a mock `tool_result` message to the model saying `Skill [name] instructions expanded. Please proceed.`.
4. Prior to the next model chat call (at the observer completion stage), flushes pending skills as synthetic injected messages.

#### Scenario: Injected synthetic messages are appended on next iteration

- Given a model returning tool call `invoke_skill` with arguments `{ "skill_name": "example-skill", "task": "format report" }`
- And the adapter supports synthetic assistant injection
- When `AgentLoop.run()` processes the step
- Then `beforeToolUse` is called for `invoke_skill`
- And two messages are injected before the next LLM call:
  - An assistant message: `[SYSTEM] Skill loaded:\n...`
  - A user message: `[SYSTEM] The skill instructions above have been loaded. Please proceed to execute the task now.`

### Requirement: Agent runtime SHALL perform best-effort shredding when deleting commercial skills

When a commercial skill is uninstalled or marked for shredding, the system MUST overwrite the target file:
1. Three times using zero bytes (`0x00`) or pseudorandom data.
2. Flush all written buffers to disk using `fsync`.
3. Truncate the file length to zero bytes.
4. Finally, unlink the file from the filesystem.

#### Scenario: File shredding successfully removes data and unlinks

- Given a temporary file with confidential content
- When `shredFile()` is invoked on the file path
- Then the file contents are overwritten and truncated
- And the file path no longer exists in the directory
