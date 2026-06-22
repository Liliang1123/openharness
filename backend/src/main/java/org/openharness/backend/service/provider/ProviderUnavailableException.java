package org.openharness.backend.service.provider;

public class ProviderUnavailableException extends RuntimeException {
  public ProviderUnavailableException(String message) { super(message); }
}
