package org.openharness.backend.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.openharness.backend.model.Contracts.ErrorResponse;
import org.openharness.backend.model.Contracts.StructuredError;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AuthFilter extends OncePerRequestFilter {
  private static final String TOKEN = "Bearer dev-service-token";
  private final ObjectMapper objectMapper;

  public AuthFilter(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (!request.getRequestURI().startsWith("/api/v1/")) {
      filterChain.doFilter(request, response);
      return;
    }

    String authorization = request.getHeader("Authorization");
    if (!TOKEN.equals(authorization)) {
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

  private void writeError(HttpServletResponse response, String errorClass, String message) throws IOException {
    response.setStatus(HttpStatus.UNAUTHORIZED.value());
    response.setContentType("application/json");
    objectMapper.writeValue(
        response.getOutputStream(),
        new ErrorResponse(new StructuredError(errorClass, message, false, "none", 0, false, 401, null)));
  }
}
