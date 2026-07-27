package org.openharness.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.TraceEvent;

class TraceServiceTest {
  @Test
  void deduplicatesRuntimeTraceEventsByCommittedEventIdentity() {
    TraceService service = new TraceService(new ObjectMapper());

    service.record(traceEvent("event-1", "span-a"));
    service.record(traceEvent("event-1", "span-b"));
    service.record(traceEvent("event-2", "span-c"));

    assertEquals(2, service.events().size());
    assertEquals("span-a", service.events().get(0).spanId());
    assertEquals("span-c", service.events().get(1).spanId());
  }

  @Test
  void boundsRecentEventsAndCommittedIdentityLruWhileRefreshingDuplicateAccess() {
    List<TraceService.IngestionSummary> summaries = new ArrayList<>();
    TraceService service = new TraceService(new ObjectMapper(), 2, 3, 2, summaries::add);

    service.record(traceEvent("event-1", "span-a"));
    service.record(traceEvent("event-1", "span-a-duplicate"));
    service.record(traceEvent("event-2", "span-b"));
    service.record(traceEvent("event-3", "span-c"));
    service.record(traceEvent("event-1", "span-a-duplicate-again"));
    service.record(traceEvent("event-4", "span-d"));
    service.record(traceEvent("event-1", "span-a-after-eviction-pressure"));

    assertEquals(List.of("span-c", "span-d"), service.events().stream().map(TraceEvent::spanId).toList());
    assertEquals(3, summaries.size());
    assertEquals(
        new TraceService.IngestionSummary(6, 4, 2, 2, 3),
        summaries.get(2));
  }

  @Test
  void doesNotWriteEveryAcceptedTraceEventToStdout() {
    PrintStream original = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    try {
      System.setOut(new PrintStream(stdout, true, StandardCharsets.UTF_8));
      new TraceService(new ObjectMapper()).record(traceEvent("event-stdout", "span-stdout"));
    } finally {
      System.setOut(original);
    }

    assertEquals("", stdout.toString(StandardCharsets.UTF_8));
  }

  private TraceEvent traceEvent(String committedEventId, String spanId) {
    return new TraceEvent(
        "trace-1",
        spanId,
        null,
        "request-1",
        "conversation-1",
        null,
        "user-1",
        "tenant-1",
        null,
        "agent-runtime",
        "MODEL_CALL_END",
        "model call end",
        Map.of("committedEventId", committedEventId),
        "ok",
        null,
        null,
        1780000000000L,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }
}
