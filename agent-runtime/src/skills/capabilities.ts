import type { ProviderMessageCapabilities } from "./types";

/**
 * Resolves the message structure capabilities for the selected model.
 * Inspects metadata overrides first, then matches model prefixes, and defaults to conservative mode.
 */
export function resolveProviderCapabilities(
  modelName: string,
  metadata?: Record<string, any>
): ProviderMessageCapabilities {
  if (metadata?.providerCapabilities) {
    const pc = metadata.providerCapabilities;
    return {
      supportsSyntheticAssistantInjection: Boolean(pc.supportsSyntheticAssistantInjection),
      requiresLastUserMessage: Boolean(pc.requiresLastUserMessage),
      requiresToolResultAdjacency: Boolean(pc.requiresToolResultAdjacency),
      supportsParallelToolResults: Boolean(pc.supportsParallelToolResults)
    };
  }

  const lowerModel = modelName.toLowerCase();
  const isClaude = lowerModel.includes("claude") || lowerModel.includes("anthropic");

  if (isClaude) {
    return {
      supportsSyntheticAssistantInjection: true,
      requiresLastUserMessage: false,
      requiresToolResultAdjacency: true,
      supportsParallelToolResults: true
    };
  }

  return {
    supportsSyntheticAssistantInjection: false,
    requiresLastUserMessage: false,
    requiresToolResultAdjacency: false,
    supportsParallelToolResults: false
  };
}
