package org.openharness.backend.model;

import java.util.List;
import java.util.Map;

public final class Contracts {
  private Contracts() {}

  public record StructuredError(
      String errorClass,
      String errorMessage,
      boolean retriable,
      String retryOwner,
      Integer maxRetries,
      Boolean fallbackAllowed,
      Integer httpStatus,
      Map<String, Object> recoveryHint) {}

  public record ErrorResponse(StructuredError error) {}

  public record ToolCall(String id, String name, String argumentsRaw) {}

  public record AgentMessage(
      String role,
      Object content,
      List<ToolCall> toolCalls,
      String toolCallId,
      List<Map<String, Object>> reasoningBlocks,
      String requestId,
      String conversationId,
      String taskId,
      Boolean systemInjected,
      Boolean sessionContext,
      Boolean compressedSummary,
      Boolean compressionInstruction,
      Boolean transientMessage) {}

  public record ToolDefinition(
      String name,
      String description,
      Map<String, Object> parameters,
      String catalogVersion,
      String catalogHash,
      String permission,
      boolean isReadOnly,
      boolean isDestructive,
      boolean requiresApproval,
      boolean isConcurrencySafe,
      String protocol) {}

  public record CatalogResponse(String catalogVersion, String catalogHash, List<ToolDefinition> tools) {}

  public record ModelChatRequest(
      String requestId,
      String conversationId,
      String userId,
      String tenantId,
      String model,
      boolean stream,
      List<AgentMessage> messages,
      List<ToolDefinition> tools,
      Map<String, Object> meta) {}

  public record Usage(
      int promptTokens,
      int completionTokens,
      int totalTokens,
      Integer cacheReadTokens,
      Integer cacheWriteTokens,
      Boolean totalIsPerTurn,
      Integer costUsdMicros) {}

  public record ModelChatResponse(
      String requestId,
      String conversationId,
      AgentMessage message,
      Usage usage,
      String rawProvider,
      StructuredError error) {}

  public record ModelCancelRequest(String requestId) {}

  public record ModelCancelResponse(String requestId, boolean cancelled) {}

  public record ToolCallRequest(
      String requestId,
      String conversationId,
      String userId,
      String tenantId,
      String toolCallId,
      String toolName,
      Map<String, Object> arguments,
      String catalogVersion,
      String catalogHash,
      String idempotencyKey,
      String approvalToken) {}

  public record ToolCallResponse(
      String requestId,
      String conversationId,
      String toolCallId,
      String toolName,
      Object result,
      String status,
      Boolean idempotentReplay,
      StructuredError error,
      String provenance) {}

  public record ToolCancelRequest(String requestId, String toolCallId) {}

  public record ToolCancelResponse(String requestId, String toolCallId, boolean cancelled) {}

  public record TraceEvent(
      String traceId,
      String spanId,
      String parentSpanId,
      String requestId,
      String conversationId,
      String taskId,
      String userId,
      String tenantId,
      String agentId,
      String runtime,
      String eventType,
      String name,
      Map<String, Object> attributes,
      String status,
      String errorClass,
      String errorMessage,
      long startTime,
      Long endTime,
      Long durationMs,
      Integer promptTokens,
      Integer completionTokens,
      Integer cacheReadTokens,
      Integer cacheWriteTokens,
      Integer costUsdMicros,
      Boolean redacted) {}
}
