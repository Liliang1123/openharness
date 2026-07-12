package org.openharness.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.openharness.backend.OpenHarnessBackendApplication;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.model.Contracts.CodexTurnCancelRequest;
import org.openharness.backend.service.provider.CodexAppServerClient;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.TurnBridge;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(classes = OpenHarnessBackendApplication.class)
@AutoConfigureMockMvc
class CodexTurnControllerTest {
  private static final String AUTH = "Bearer dev-service-token";
  private static final Identity ID = new Identity("tenant", "user", "request", "conversation");

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired CodexPendingTurnRegistry registry;
  @Autowired CodexTurnController controller;

  @Test
  void controllerUsesTheProductionSingletonAndMapsFinalResult() throws Exception {
    assertThat(ReflectionTestUtils.getField(controller, "registry")).isSameAs(registry);
    CountingBridge bridge = new CountingBridge();
    bridge.next = new CodexAppServerClient.FinalTurn(
        "thread-final", "turn-final", "answer", "because",
        new CodexAppServerClient.TokenUsage(7, 3, 2));
    String id = register("final", bridge);

    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(result("final", "key", "ok", "safe"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.message.content", equalTo("answer")))
        .andExpect(jsonPath("$.message.reasoningBlocks[0].type", equalTo("thinking")))
        .andExpect(jsonPath("$.message.reasoningBlocks[0].text", equalTo("because")))
        .andExpect(jsonPath("$.pendingTurn").doesNotExist())
        .andExpect(jsonPath("$.error").doesNotExist())
        .andExpect(jsonPath("$.usage.promptTokens", equalTo(7)))
        .andExpect(jsonPath("$.usage.completionTokens", equalTo(3)))
        .andExpect(jsonPath("$.usage.totalTokens", equalTo(10)))
        .andExpect(jsonPath("$.usage.cacheReadTokens", equalTo(2)))
        .andExpect(jsonPath("$.rawProvider", equalTo("codex-app-server")));
    assertThat(bridge.completes).hasValue(1);
  }

  @Test
  void sequentialPendingAndIdenticalReplayReturnTheSameEnvelopeOnce() throws Exception {
    CountingBridge bridge = new CountingBridge();
    bridge.next = new CodexAppServerClient.PendingToolCall(
        9, "thread-sequential", "turn-sequential", "call-sequential-2", "echo", "{\"a\":1}");
    String id = register("sequential", bridge);
    CodexToolResultSubmission submission = result("sequential", "key", "ok", "safe");

    String first = mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(submission)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.message").doesNotExist())
        .andExpect(jsonPath("$.error").doesNotExist())
        .andExpect(jsonPath("$.pendingTurn.bridgeId", equalTo(id)))
        .andExpect(jsonPath("$.pendingTurn.callId", equalTo("call-sequential-2")))
        .andExpect(jsonPath("$.pendingTurn.argumentsRaw", equalTo("{\"a\":1}")))
        .andExpect(jsonPath("$.idempotentReplay").doesNotExist())
        .andReturn().getResponse().getContentAsString();

    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(submission)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pendingTurn.bridgeId", equalTo(id)))
        .andExpect(jsonPath("$.pendingTurn.callId", equalTo("call-sequential-2")))
        .andExpect(jsonPath("$.idempotentReplay", equalTo(true)));
    assertThat(first).doesNotContain("idempotentReplay");
    assertThat(bridge.completes).hasValue(1);
  }

  @Test
  void validCancelIsIdempotentAndTerminatesOnce() throws Exception {
    CountingBridge bridge = new CountingBridge();
    String id = register("cancel", bridge);
    CodexTurnCancelRequest request = cancel("cancel");

    mvc.perform(valid(post(cancelPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.error.errorClass", equalTo("BRIDGE_TERMINATED")))
        .andExpect(jsonPath("$.message").doesNotExist())
        .andExpect(jsonPath("$.pendingTurn").doesNotExist());
    mvc.perform(valid(post(cancelPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.idempotentReplay", equalTo(true)));
    assertThat(bridge.terminates).hasValue(1);
  }

  @Test
  void unknownCrossIdentityAndCorrelationMismatchShareOneNonDisclosing404() throws Exception {
    CountingBridge bridge = new CountingBridge();
    String id = register("identity", bridge);
    CodexToolResultSubmission submission = result("identity", "key", "ok", "RESULT-CANARY");

    assertNotFound(valid(post(resultPath("BRIDGE-CANARY"))), submission);
    assertNotFound(headers(post(resultPath(id)), "other", "user", "request"), submission);
    assertNotFound(valid(post(resultPath(id))), new CodexToolResultSubmission(
        "request", "conversation", "thread-identity", "turn-identity", "other-call",
        "key", "ok", "RESULT-CANARY"));
    assertThat(bridge.mutations()).isZero();
  }

  @Test
  void exactOwnerGoneIs410ButCrossIdentityStill404() throws Exception {
    CountingBridge bridge = new CountingBridge();
    bridge.failComplete = true;
    String id = register("gone", bridge);
    CodexToolResultSubmission submission = result("gone", "key", "ok", "RESULT-CANARY");

    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(submission)))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.error.errorClass", equalTo("BRIDGE_TURN_GONE")))
        .andExpect(result -> assertThat(result.getResponse().getContentAsString())
            .doesNotContain("RESULT-CANARY", id));
    assertNotFound(headers(post(resultPath(id)), "other", "user", "request"), submission);
    assertThat(bridge.completes).hasValue(1);
  }

  @Test
  void conflictingReplayIs409WithoutSecondResponderWrite() throws Exception {
    CountingBridge bridge = new CountingBridge();
    String id = register("conflict", bridge);
    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(result("conflict", "key", "ok", "safe"))))
        .andExpect(status().isOk());
    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(result("conflict", "other", "ok", "safe"))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.errorClass", equalTo("BRIDGE_RESULT_CONFLICT")));
    assertThat(bridge.completes).hasValue(1);
  }

  @Test
  void authFilterStillOwnsTokenAndRequiredHeaderFailures() throws Exception {
    mvc.perform(post(resultPath("missing"))).andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.errorClass", equalTo("AUTH_SERVICE_TOKEN_INVALID")));
    mvc.perform(post(resultPath("missing")).header("Authorization", "Bearer wrong"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.errorClass", equalTo("AUTH_SERVICE_TOKEN_INVALID")));
    mvc.perform(post(resultPath("missing"))
            .header("Authorization", AUTH)
            .header("X-Tenant-Id", "tenant")
            .header("X-Trace-Id", "trace")
            .header("X-Request-Id", "request"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.errorClass", equalTo("AUTH_MISSING_HEADER")));
  }

  @Test
  void securityCanariesAreNotReflectedAndSyntheticOauthFieldsAreRejected() throws Exception {
    CountingBridge bridge = new CountingBridge();
    String id = register("security", bridge);

    mvc.perform(post(resultPath(id))
            .header("Authorization", "Bearer AUTH-CANARY")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(result("security", "key", "ok", "RESULT-CANARY"))))
        .andExpect(status().isUnauthorized())
        .andExpect(result -> assertThat(result.getResponse().getContentAsString())
            .doesNotContain("AUTH-CANARY", "RESULT-CANARY", id));

    String bodyWithOauth = json.writeValueAsString(result("security", "key", "ok", "RESULT-CANARY"));
    bodyWithOauth = bodyWithOauth.substring(0, bodyWithOauth.length() - 1)
        + ",\"accessToken\":\"OAUTH-CANARY\",\"refreshToken\":\"REFRESH-CANARY\"}";
    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON).content(bodyWithOauth))
        .andExpect(status().isBadRequest())
        .andExpect(result -> assertThat(result.getResponse().getContentAsString())
            .doesNotContain("OAUTH-CANARY", "REFRESH-CANARY", "RESULT-CANARY", id));

    String cancelWithOauth = json.writeValueAsString(cancel("security"));
    cancelWithOauth = cancelWithOauth.substring(0, cancelWithOauth.length() - 1)
        + ",\"accessToken\":\"CANCEL-OAUTH-CANARY\"}";
    mvc.perform(valid(post(cancelPath(id))).contentType(MediaType.APPLICATION_JSON).content(cancelWithOauth))
        .andExpect(status().isBadRequest())
        .andExpect(result -> assertThat(result.getResponse().getContentAsString())
            .doesNotContain("CANCEL-OAUTH-CANARY", id));

    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content("{\"content\":\"Authorization: Bearer HTTP-CANARY\""))
        .andExpect(status().isBadRequest())
        .andExpect(result -> assertThat(result.getResponse().getContentAsString())
            .doesNotContain("HTTP-CANARY", id));
    assertThat(bridge.mutations()).isZero();
  }

  @Test
  void oversizedIdentityHeaderIsNonDisclosing404() throws Exception {
    CountingBridge bridge = new CountingBridge();
    String id = register("bounded-identity", bridge);
    mvc.perform(headers(post(resultPath(id)), "x".repeat(257), "user", "request")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(result("bounded-identity", "key", "ok", "safe"))))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.errorClass", equalTo("BRIDGE_TURN_NOT_FOUND")))
        .andExpect(result -> assertThat(result.getResponse().getContentAsString()).doesNotContain(id));
    assertThat(bridge.mutations()).isZero();
  }

  @Test
  void usageSumOverflowReturnsStructuredProtocolFailure() throws Exception {
    CountingBridge bridge = new CountingBridge();
    bridge.next = new CodexAppServerClient.FinalTurn(
        "thread-overflow", "turn-overflow", "safe", "",
        new CodexAppServerClient.TokenUsage(Integer.MAX_VALUE, Integer.MAX_VALUE, 0));
    String id = register("overflow", bridge);
    mvc.perform(valid(post(resultPath(id))).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(result("overflow", "key", "ok", "safe"))))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.error.errorClass", equalTo("BRIDGE_PROTOCOL_FAILURE")))
        .andExpect(result -> assertThat(result.getResponse().getContentAsString()).doesNotContain(id));
  }

  private void assertNotFound(
      MockHttpServletRequestBuilder builder,
      CodexToolResultSubmission submission) throws Exception {
    mvc.perform(builder.contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(submission)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.errorClass", equalTo("BRIDGE_TURN_NOT_FOUND")))
        .andExpect(result -> assertThat(result.getResponse().getContentAsString())
            .doesNotContain("BRIDGE-CANARY", "RESULT-CANARY", submission.callId()));
  }

  private String register(String suffix, CountingBridge bridge) {
    return registry.register(ID,
        new CodexAppServerClient.PendingToolCall(
            1, "thread-" + suffix, "turn-" + suffix, "call-" + suffix, "echo", "{}"),
        bridge).bridgeId();
  }

  private static CodexToolResultSubmission result(
      String suffix, String key, String status, String content) {
    return new CodexToolResultSubmission(
        "request", "conversation", "thread-" + suffix, "turn-" + suffix,
        "call-" + suffix, key, status, content);
  }

  private static CodexTurnCancelRequest cancel(String suffix) {
    return new CodexTurnCancelRequest(
        "request", "conversation", "thread-" + suffix, "turn-" + suffix, "call-" + suffix);
  }

  private static String resultPath(String bridge) {
    return "/api/v1/model/codex/turns/" + bridge + "/tool-result";
  }

  private static String cancelPath(String bridge) {
    return "/api/v1/model/codex/turns/" + bridge + "/cancel";
  }

  private static MockHttpServletRequestBuilder valid(MockHttpServletRequestBuilder builder) {
    return headers(builder, "tenant", "user", "request");
  }

  private static MockHttpServletRequestBuilder headers(
      MockHttpServletRequestBuilder builder,
      String tenant,
      String user,
      String request) {
    return builder.header("Authorization", AUTH)
        .header("X-Tenant-Id", tenant)
        .header("X-User-Id", user)
        .header("X-Trace-Id", "trace")
        .header("X-Request-Id", request);
  }

  private static final class CountingBridge implements TurnBridge {
    final AtomicInteger completes = new AtomicInteger();
    final AtomicInteger terminates = new AtomicInteger();
    CodexAppServerClient.TurnResult next = new CodexAppServerClient.FinalTurn(
        "thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    boolean failComplete;

    public CodexAppServerClient.TurnResult complete(String status, String content) {
      completes.incrementAndGet();
      if (failComplete) throw new IllegalStateException("BRIDGE-CANARY " + content);
      return next;
    }

    public CodexAppServerClient.TurnResult terminate(String status) {
      terminates.incrementAndGet();
      return new CodexAppServerClient.ErrorTurn("BRIDGE_TERMINATED", "Codex turn terminated");
    }

    int mutations() { return completes.get() + terminates.get(); }
  }
}
