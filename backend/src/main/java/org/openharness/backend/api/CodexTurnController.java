package org.openharness.backend.api;

import java.util.List;
import java.util.Map;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.model.Contracts.CodexTurnCancelRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.StructuredError;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.provider.CodexAppServerClient.ErrorTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.BridgeException;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.RegistryResult;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal service-authenticated continuation boundary for one exact Codex turn. */
@RestController
@RequestMapping("/api/v1/model/codex/turns")
public class CodexTurnController {
  private static final String RAW_PROVIDER = "codex-app-server";
  private final CodexPendingTurnRegistry registry;

  public CodexTurnController(CodexPendingTurnRegistry registry) {
    this.registry = registry;
  }

  @PostMapping("/{bridgeId}/tool-result")
  ModelChatResponse complete(
      @PathVariable String bridgeId,
      @RequestHeader("X-Tenant-Id") String tenantId,
      @RequestHeader("X-User-Id") String userId,
      @RequestHeader("X-Request-Id") String requestId,
      @RequestBody CodexToolResultSubmission submission) {
    try {
      RegistryResult result = registry.complete(
          identity(tenantId, userId, requestId, submission.conversationId()),
          bridgeId,
          submission);
      return response(submission.requestId(), submission.conversationId(), result);
    } catch (BridgeException failure) {
      throw httpError(failure.code());
    }
  }

  @PostMapping("/{bridgeId}/cancel")
  ModelChatResponse cancel(
      @PathVariable String bridgeId,
      @RequestHeader("X-Tenant-Id") String tenantId,
      @RequestHeader("X-User-Id") String userId,
      @RequestHeader("X-Request-Id") String requestId,
      @RequestBody CodexTurnCancelRequest request) {
    try {
      RegistryResult result = registry.cancel(
          identity(tenantId, userId, requestId, request.conversationId()),
          bridgeId,
          request);
      return response(request.requestId(), request.conversationId(), result);
    } catch (BridgeException failure) {
      throw httpError(failure.code());
    }
  }

  private static ModelChatResponse response(
      String requestId,
      String conversationId,
      RegistryResult result) {
    Boolean replay = result.idempotentReplay() ? Boolean.TRUE : null;
    if (result.turnResult() instanceof PendingToolCall) {
      if (result.pendingTurn() == null) throw protocolFailure();
      return new ModelChatResponse(
          requestId, conversationId, null, result.pendingTurn(), null, RAW_PROVIDER, null, replay);
    }
    if (result.pendingTurn() != null) throw protocolFailure();
    if (result.turnResult() instanceof FinalTurn turn) {
      if (turn.usage() == null) throw protocolFailure();
      List<Map<String, Object>> reasoning = turn.reasoning() == null || turn.reasoning().isEmpty()
          ? null
          : List.of(Map.of("type", "thinking", "text", turn.reasoning()));
      AgentMessage message = new AgentMessage(
          "assistant", turn.message(), null, null, reasoning,
          null, null, null, null, null, null, null, null);
      Usage usage = new Usage(
          turn.usage().inputTokens(),
          turn.usage().outputTokens(),
          totalTokens(turn.usage().inputTokens(), turn.usage().outputTokens()),
          turn.usage().cachedInputTokens(),
          null,
          true,
          null);
      return new ModelChatResponse(
          requestId, conversationId, message, null, usage, RAW_PROVIDER, null, replay);
    }
    if (result.turnResult() instanceof ErrorTurn turn) {
      StructuredError error = new StructuredError(
          turn.code(), turn.message(), false, "none", 0, false, 200, Map.of());
      return new ModelChatResponse(
          requestId, conversationId, null, null, null, RAW_PROVIDER, error, replay);
    }
    throw protocolFailure();
  }

  private static RuntimeException httpError(String code) {
    return switch (code) {
      case "BRIDGE_TURN_NOT_FOUND" -> StructuredErrorHandler.error(
          HttpStatus.NOT_FOUND, code, "Codex turn is unavailable", false, "none");
      case "BRIDGE_TURN_GONE" -> StructuredErrorHandler.error(
          HttpStatus.GONE, code, "Codex turn is unavailable", false, "none");
      case "BRIDGE_RESULT_CONFLICT" -> StructuredErrorHandler.error(
          HttpStatus.CONFLICT, code, "Codex bridge result conflicts with recorded outcome", false, "none");
      default -> protocolFailure();
    };
  }

  private static Identity identity(
      String tenantId,
      String userId,
      String requestId,
      String conversationId) {
    try {
      return new Identity(tenantId, userId, requestId, conversationId);
    } catch (IllegalArgumentException invalid) {
      throw httpError("BRIDGE_TURN_NOT_FOUND");
    }
  }

  private static int totalTokens(int inputTokens, int outputTokens) {
    long total = (long) inputTokens + outputTokens;
    if (total > Integer.MAX_VALUE) throw protocolFailure();
    return (int) total;
  }

  private static RuntimeException protocolFailure() {
    return StructuredErrorHandler.error(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "BRIDGE_PROTOCOL_FAILURE",
        "Codex turn continuation is unavailable",
        false,
        "none");
  }
}
