package org.openharness.backend.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.openharness.backend.model.Contracts.ErrorResponse;
import org.openharness.backend.model.Contracts.StructuredError;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AuthFilter extends OncePerRequestFilter {
  private final ObjectMapper objectMapper;
  private final byte[] expectedAuthorization;

  public AuthFilter(
      ObjectMapper objectMapper,
      @Value("${openharness.service-token:${OPENHARNESS_SERVICE_TOKEN:dev-service-token}}")
          String serviceToken) {
    if (serviceToken == null
        || serviceToken.isBlank()
        || serviceToken.chars().anyMatch(Character::isWhitespace)
        || serviceToken.regionMatches(true, 0, "Bearer", 0, "Bearer".length())) {
      throw new IllegalArgumentException("Java service token configuration is invalid");
    }
    this.objectMapper = objectMapper;
    this.expectedAuthorization =
        ("Bearer " + serviceToken).getBytes(StandardCharsets.UTF_8);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (!request.getRequestURI().startsWith("/api/v1/")) {
      filterChain.doFilter(request, response);
      return;
    }

    String authorization = request.getHeader("Authorization");
    if (!validAuthorization(authorization)) {
      writeError(response, "AUTH_SERVICE_TOKEN_INVALID", "Service token is missing or invalid.");
      return;
    }

    for (String header : new String[] {"X-User-Id", "X-Tenant-Id", "X-Trace-Id", "X-Request-Id"}) {
      if (request.getHeader(header) == null || request.getHeader(header).isBlank()) {
        writeError(response, "AUTH_MISSING_HEADER", "Missing required header: " + header);
        return;
      }
    }

    filterChain.doFilter(request, response);
  }

  private boolean validAuthorization(String authorization) {
    if (authorization == null) return false;
    return MessageDigest.isEqual(
        expectedAuthorization,
        authorization.getBytes(StandardCharsets.UTF_8));
  }

  private void writeError(HttpServletResponse response, String errorClass, String message) throws IOException {
    response.setStatus(HttpStatus.UNAUTHORIZED.value());
    response.setContentType("application/json");
    objectMapper.writeValue(
        response.getOutputStream(),
        new ErrorResponse(new StructuredError(errorClass, message, false, "none", 0, false, 401, null)));
  }
}
