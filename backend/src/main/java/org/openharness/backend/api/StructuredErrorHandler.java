package org.openharness.backend.api;

import java.util.Map;
import org.openharness.backend.model.Contracts.ErrorResponse;
import org.openharness.backend.model.Contracts.StructuredError;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class StructuredErrorHandler {
  @ExceptionHandler(AppException.class)
  ResponseEntity<ErrorResponse> handleAppException(AppException exception) {
    return ResponseEntity.status(exception.status()).body(new ErrorResponse(exception.error()));
  }

  public static AppException error(HttpStatus status, String errorClass, String message, boolean retriable, String retryOwner) {
    return new AppException(
        status,
        new StructuredError(
            errorClass, message, retriable, retryOwner, 0, false, status.value(), Map.of()));
  }
}

class AppException extends RuntimeException {
  private final HttpStatus status;
  private final StructuredError error;

  AppException(HttpStatus status, StructuredError error) {
    super(error.errorMessage());
    this.status = status;
    this.error = error;
  }

  HttpStatus status() {
    return status;
  }

  StructuredError error() {
    return error;
  }
}
