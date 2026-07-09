package org.openharness.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openharness.backend.model.Contracts.TraceEvent;
import org.springframework.stereotype.Service;

@Service
public class TraceService {
  private final List<TraceEvent> events = new ArrayList<>();
  private final Set<String> committedEventIds = new HashSet<>();
  private final ObjectMapper objectMapper;

  public TraceService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public synchronized void record(TraceEvent event) {
    String committedEventId = committedEventId(event);
    if (committedEventId != null && !committedEventIds.add(committedEventId)) {
      return;
    }
    events.add(event);
    try {
      System.out.println(objectMapper.writeValueAsString(event));
    } catch (JsonProcessingException ignored) {
      System.out.println("{\"traceSerializeError\":true}");
    }
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
