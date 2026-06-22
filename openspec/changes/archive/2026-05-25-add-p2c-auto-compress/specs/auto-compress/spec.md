# Spec: auto-compress

## ADDED Requirements

### Requirement: Agent loop auto-triggers compression when token threshold exceeded

The agent runtime SHALL check `shouldCompress` after producing a final answer and before persisting history. When the check returns true, the runtime MUST call `compress` to summarize old messages and archive them as chunk files.

#### Scenario: Long conversation triggers compression

- Given a conversation with estimated tokens > COMPRESSION_THRESHOLD (default 8000)
- When the agent loop completes a turn
- Then `compress` is called before `history.save()`
- And the persisted history contains a summary message replacing old messages

#### Scenario: Short conversation skips compression

- Given a conversation with estimated tokens < COMPRESSION_THRESHOLD
- When the agent loop completes a turn
- Then `compress` is not called
- And history is saved as-is

### Requirement: Compression failure does not block response

The agent runtime SHALL catch any error thrown by the compress flow and log it as a warning. The runtime MUST still return the response to the user and persist the uncompressed history.

#### Scenario: Compress endpoint unavailable

- Given the Java compress endpoint returns an error
- When auto-compress is triggered
- Then the error is logged as a warning
- And the response is still returned to the user
- And history is saved without compression

### Requirement: Auto-compress is configurable

The agent runtime SHALL read the environment variable `COMPRESSION_AUTO`. When set to `false`, the runtime MUST skip the compression check entirely. The default value SHALL be `true`.

#### Scenario: Disabled via environment variable

- Given `COMPRESSION_AUTO=false`
- When the agent loop completes a turn
- Then `shouldCompress` is not called
- And no compression occurs regardless of token count
