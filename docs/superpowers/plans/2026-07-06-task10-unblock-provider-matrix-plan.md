# Plan: Task 10 — Unblock Provider Matrix (Stream, Timeout, Cancellation, Reasoning)

**Goal:** Implement stream, bounded timeout, cancellation, and reasoning capability handling in both OpenAI-compatible and Anthropic adapters, and unblock these test matrix rows in the local-verified track.

---

## 1. Requirements & Acceptance Criteria

- **Stream:** When `request.stream()` is true, adapters must request SSE event streams (`stream: true`), consume chunks, merge them into a standard response format, and return it.
- **Timeout:** Adapters must respect `request.meta.get("timeoutMs")` (or fall back to a reasonable default) and set `HttpRequest.timeout` accordingly. On timeout, a meaningful timeout exception must be thrown.
- **Cancellation:** Adapters must expose a way to interrupt active HTTP requests. We will map active request IDs to processing threads and interrupt them when cancellation is triggered.
- **Reasoning:**
  - OpenAI-compatible: Parse `reasoning_content` from the message and map it to `reasoningBlocks`.
  - Anthropic: Parse `thinking` and `redacted_thinking` content blocks and map them to `reasoningBlocks`.
- **Testing (TDD):** Modify fake server matrices (`OpenAiFakeProviderMatrix` and `AnthropicFakeProviderMatrix`) to simulate these capabilities, and assertions in tests must transition from `blocked` to `pass`.

---

## 2. Planned Changes

### Backend (Java)

1. **`ProviderAdapter.java`**:
   - Add `default void cancel(String requestId) {}` to allow request cancellation.

2. **`OpenAiCompatibleAdapter.java`**:
   - Track active requests (`ConcurrentHashMap<String, Thread>`) to implement `cancel`.
   - Update `chat` to parse `timeoutMs` from `request.meta()`, apply it to `HttpRequest`, and set `stream: true` if `request.stream()` is true.
   - Implement `mergeOpenAiStream` to aggregate OpenAI-compatible stream chunks (including content, tool calls, and usage).
   - Parse `reasoning_content` and add it to `AgentMessage.reasoningBlocks`.

3. **`AnthropicAdapter.java`**:
   - Track active requests (`ConcurrentHashMap<String, Thread>`) to implement `cancel`.
   - Update `chat` to parse `timeoutMs` from `request.meta()`, apply it to `HttpRequest`, and set `stream: true` if `request.stream()` is true.
   - Implement `mergeAnthropicStream` to aggregate Anthropic stream chunks (handling start, delta, blocks, usage, and stop reasons).
   - Parse `thinking`/`redacted_thinking` blocks and map them to `AgentMessage.reasoningBlocks`.

4. **Fake Matrix & Tests**:
   - **`OpenAiFakeProviderMatrix.java` & `AnthropicFakeProviderMatrix.java`**: Implement sync/stream/timeout/cancellation/reasoning tests on fake loopback server and assert `pass` (instead of `blocked`).
   - **`OpenAiFakeProviderMatrixTest.java` & `AnthropicFakeProviderMatrixTest.java`**: Implement fake HTTP endpoint behavior to support streaming, timeouts, cancellation triggers, and reasoning blocks.

---

## 3. Execution Plan

- **Step 1:** Modify `ProviderAdapter.java` to support `cancel` signature.
- **Step 2:** Update `OpenAiFakeProviderMatrixTest.java` fake server contexts to handle streaming, reasoning, and latency simulations.
- **Step 3:** Implement stream, timeout, cancellation, and reasoning logic in `OpenAiCompatibleAdapter.java`.
- **Step 4:** Modify `OpenAiFakeProviderMatrix.java` to run TDD assertions for the new behaviors and ensure all rows `pass`.
- **Step 5:** Update `AnthropicFakeProviderMatrixTest.java` fake server contexts.
- **Step 6:** Implement stream, timeout, cancellation, and reasoning logic in `AnthropicAdapter.java`.
- **Step 7:** Modify `AnthropicFakeProviderMatrix.java` to run TDD assertions and ensure all rows `pass`.
- **Step 8:** Run local verification tests: `mvn -f backend/pom.xml test` and TS tests, then re-generate local qualification matrix report files.
