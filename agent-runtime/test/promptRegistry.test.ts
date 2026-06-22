import { afterEach, describe, expect, it } from "vitest";
import { resolvePromptTemplate, promptedMessages, buildSessionContext } from "../src/prompts/registry";
import type { AgentMessage } from "../src/types";

describe("prompt registry", () => {
  afterEach(() => {
    delete process.env.OPENHARNESS_PROMPT_REF;
  });


  it("resolves default prompt when no env reference is configured", () => {
    const prompt = resolvePromptTemplate();
    expect(prompt.promptId).toBe("openharness-default");
    expect(prompt.version).toBe("v1");
    expect(prompt.role).toBe("system");
  });

  it("resolves prompt from OPENHARNESS_PROMPT_REF", () => {
    process.env.OPENHARNESS_PROMPT_REF = "openharness-default@v1";
    expect(resolvePromptTemplate().content).toContain("OpenHarness");
  });

  it("fails closed for unknown prompt references", () => {
    process.env.OPENHARNESS_PROMPT_REF = "missing@v1";
    expect(() => resolvePromptTemplate()).toThrow(/Unknown prompt template/);
  });

  it("prepends system prompt without mutating input messages", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "hello" }];
    const result = promptedMessages(messages);
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[1]).toEqual({ role: "user", content: "hello" });
    expect(messages).toEqual([{ role: "user", content: "hello" }]);
    expect(result.meta).toEqual({ promptId: "openharness-default", promptVersion: "v1" });
  });

  it("builds correct session context", () => {
    const sessionCtx = buildSessionContext({
      model: "claude-3-5-sonnet",
      workingDir: "/workspace",
      date: "2026-06-22",
      os: "darwin"
    });
    expect(sessionCtx).toBe("[Session context: Today is 2026-06-22. Current model: claude-3-5-sonnet. OS: darwin. Working directory: /workspace]");
  });
});


