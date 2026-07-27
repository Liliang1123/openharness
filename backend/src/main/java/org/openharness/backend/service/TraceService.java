package org.openharness.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;
import org.openharness.backend.model.Contracts.TraceEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TraceService {
  private static final Logger LOG = LoggerFactory.getLogger(TraceService.class);
  private static final int RECENT_EVENT_LIMIT = 10_000;
  private static final int COMMITTED_IDENTITY_LIMIT = 100_000;
  private static final long SUMMARY_EVERY_ATTEMPTS = 100_000;

  private final Deque<TraceEvent> events = new ArrayDeque<>();
  private final LinkedHashMap<String, Boolean> committedEventIds =
      new LinkedHashMap<>(16, 0.75f, true);
  private final int recentEventLimit;
  private final int committedIdentityLimit;
  private final long summaryEveryAttempts;
  private final Consumer<IngestionSummary> summarySink;
  private final ObjectMapper objectMapper;
  private long attempts;
  private long accepted;
  private long duplicates;

  @Autowired
  public TraceService(ObjectMapper objectMapper) {
    this(
        objectMapper,
        RECENT_EVENT_LIMIT,
        COMMITTED_IDENTITY_LIMIT,
        SUMMARY_EVERY_ATTEMPTS,
        TraceService::logSummary);
  }

  TraceService(
      ObjectMapper objectMapper,
      int recentEventLimit,
      int committedIdentityLimit,
      long summaryEveryAttempts,
      Consumer<IngestionSummary> summarySink) {
    Objects.requireNonNull(objectMapper, "objectMapper");
    if (recentEventLimit <= 0
        || committedIdentityLimit <= 0
        || summaryEveryAttempts <= 0) {
      throw new IllegalArgumentException("Trace retention and summary limits must be positive");
    }
    this.recentEventLimit = recentEventLimit;
    this.committedIdentityLimit = committedIdentityLimit;
    this.summaryEveryAttempts = summaryEveryAttempts;
    this.summarySink = Objects.requireNonNull(summarySink, "summarySink");
    this.objectMapper = objectMapper;
  }

  public synchronized void record(TraceEvent event) {
    attempts += 1;
    String committedEventId = committedEventId(event);
    if (committedEventId != null) {
      if (committedEventIds.get(committedEventId) != null) {
        duplicates += 1;
        emitSummaryIfDue();
        return;
      }
      committedEventIds.put(committedEventId, Boolean.TRUE);
      trimCommittedIdentities();
    }

    events.addLast(event);
    while (events.size() > recentEventLimit) {
      events.removeFirst();
    }
    accepted += 1;
    logEventIfDebug(event);
    emitSummaryIfDue();
  }

  private String committedEventId(TraceEvent event) {
    if (event.attributes() == null) return null;
    Object value = event.attributes().get("committedEventId");
    if (value instanceof String id && !id.isBlank()) return id;
    return null;
  }

  public synchronized List<TraceEvent> events() {
    return List.copyOf(events);
  }

  private void trimCommittedIdentities() {
    while (committedEventIds.size() > committedIdentityLimit) {
      var iterator = committedEventIds.entrySet().iterator();
      iterator.next();
      iterator.remove();
    }
  }

  private void emitSummaryIfDue() {
    if (attempts % summaryEveryAttempts != 0) return;
    summarySink.accept(
        new IngestionSummary(
            attempts,
            accepted,
            duplicates,
            events.size(),
            committedEventIds.size()));
  }

  private void logEventIfDebug(TraceEvent event) {
    if (!LOG.isDebugEnabled()) return;
    try {
      LOG.debug("trace_event={}", objectMapper.writeValueAsString(event));
    } catch (JsonProcessingException ignored) {
      LOG.debug("trace_event_serialize_error");
    }
  }

  private static void logSummary(IngestionSummary summary) {
    LOG.info(
        "trace_ingestion_summary attempts={} accepted={} duplicates={} retainedEvents={} committedIdentities={}",
        summary.attempts(),
        summary.accepted(),
        summary.duplicates(),
        summary.retainedEvents(),
        summary.committedIdentities());
  }

  record IngestionSummary(
      long attempts,
      long accepted,
      long duplicates,
      int retainedEvents,
      int committedIdentities) {}

  public void backendEvent(
      String traceId,
      String requestId,
      String conversationId,
      String userId,
      String tenantId,
      String eventType,
      String name,
      Map<String, Object> attributes) {
    record(
        new TraceEvent(
            traceId,
            java.util.UUID.randomUUID().toString(),
            null,
            requestId,
            conversationId,
            null,
            userId,
            tenantId,
            null,
            "backend",
            eventType,
            name,
            attributes,
            "ok",
            null,
            null,
            System.currentTimeMillis(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null));
  }
}
