package org.openharness.backend.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AuthFilterTest {
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void acceptsTheConfiguredRotatedTokenAndRejectsTheDevelopmentToken() throws Exception {
    AuthFilter filter = new AuthFilter(objectMapper, "rotated-local-token");

    MockHttpServletResponse accepted = invoke(filter, "Bearer rotated-local-token");
    assertEquals(200, accepted.getStatus());

    MockHttpServletResponse rejected = invoke(filter, "Bearer dev-service-token");
    assertEquals(401, rejected.getStatus());
    JsonNode error = objectMapper.readTree(rejected.getContentAsByteArray());
    assertEquals("AUTH_SERVICE_TOKEN_INVALID", error.at("/error/errorClass").asText());
  }

  @Test
  void rejectsAMissingAuthorizationHeader() throws Exception {
    AuthFilter filter = new AuthFilter(objectMapper, "rotated-local-token");

    MockHttpServletResponse rejected = invoke(filter, null);

    assertEquals(401, rejected.getStatus());
    JsonNode error = objectMapper.readTree(rejected.getContentAsByteArray());
    assertEquals("AUTH_SERVICE_TOKEN_INVALID", error.at("/error/errorClass").asText());
  }

  @Test
  void rejectsUnsafeServiceTokenConfiguration() {
    for (String token : new String[] {"", " ", "Bearer token", "two tokens", "line\nbreak"}) {
      IllegalArgumentException error = assertThrows(
          IllegalArgumentException.class,
          () -> new AuthFilter(objectMapper, token));
      assertNotNull(error.getMessage());
    }
  }

  private MockHttpServletResponse invoke(AuthFilter filter, String authorization) throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/trace/events");
    if (authorization != null) request.addHeader("Authorization", authorization);
    request.addHeader("X-User-Id", "user-a");
    request.addHeader("X-Tenant-Id", "tenant-a");
    request.addHeader("X-Trace-Id", "trace-a");
    request.addHeader("X-Request-Id", "request-a");
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(request, response, new MockFilterChain());
    return response;
  }
}
