package org.openharness.backend.service.provider;

import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;

public interface ProviderAdapter {
  ModelChatResponse chat(ModelChatRequest request, ProviderConfig config);
  String providerType();
  default void cancel(String requestId) {}
}
