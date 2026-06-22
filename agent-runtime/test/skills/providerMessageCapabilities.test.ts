import { describe, it, expect } from "vitest";
import { resolveProviderCapabilities } from "../../src/skills/capabilities";

describe("resolveProviderCapabilities", () => {
  it("resolves claude models with synthetic assistant support", () => {
    const cap = resolveProviderCapabilities("claude-3-5-sonnet");
    expect(cap.supportsSyntheticAssistantInjection).toBe(true);
    expect(cap.requiresToolResultAdjacency).toBe(true);
  });

  it("resolves unknown models conservatively", () => {
    const cap = resolveProviderCapabilities("some-unknown-llm");
    expect(cap.supportsSyntheticAssistantInjection).toBe(false);
  });

  it("respects metadata overrides if provided", () => {
    const metadata = {
      providerCapabilities: {
        supportsSyntheticAssistantInjection: true,
        requiresLastUserMessage: true,
        requiresToolResultAdjacency: false,
        supportsParallelToolResults: true
      }
    };
    const cap = resolveProviderCapabilities("some-unknown-llm", metadata);
    expect(cap.supportsSyntheticAssistantInjection).toBe(true);
    expect(cap.requiresLastUserMessage).toBe(true);
    expect(cap.requiresToolResultAdjacency).toBe(false);
    expect(cap.supportsParallelToolResults).toBe(true);
  });
});
