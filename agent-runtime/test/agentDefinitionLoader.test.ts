import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION, loadAgentDefinitions } from "../src/agentDefinitionLoader";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "openharness-agent-definitions-"));
}

describe("Agent Definition Loader", () => {
  it("returns the default definition when the directory is missing", () => {
    const dir = join(tempDir(), "missing");

    const registry = loadAgentDefinitions(dir);

    expect(registry.get(DEFAULT_AGENT_DEFINITION.agentId)).toEqual(DEFAULT_AGENT_DEFINITION);
    expect(registry.list()).toEqual([DEFAULT_AGENT_DEFINITION]);
  });

  it("returns the default definition when the directory is empty", () => {
    const dir = tempDir();
    try {
      const registry = loadAgentDefinitions(dir);

      expect(registry.get(DEFAULT_AGENT_DEFINITION.agentId)).toEqual(DEFAULT_AGENT_DEFINITION);
      expect(registry.list()).toEqual([DEFAULT_AGENT_DEFINITION]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads valid JSON definitions by agentId", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "support.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"],
        model: "default"
      }));

      const registry = loadAgentDefinitions(dir);

      expect(registry.get("support-agent")?.promptRef).toBe("openharness-default@v1");
      expect(registry.get("support-agent")?.tools).toEqual(["echo"]);
      expect(registry.list().map((definition) => definition.agentId)).toEqual(["support-agent"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-json files", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "README.md"), "not a definition");

      const registry = loadAgentDefinitions(dir);

      expect(registry.list()).toEqual([DEFAULT_AGENT_DEFINITION]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed JSON", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "bad.json"), "{\"agentId\":");

      expect(() => loadAgentDefinitions(dir)).toThrow(/Failed to parse agent definition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on invalid schema", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "bad.json"), JSON.stringify({
        agentId: "bad space",
        promptRef: "openharness-default@v1",
        tools: []
      }));

      expect(() => loadAgentDefinitions(dir)).toThrow(/Invalid agent definition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on duplicate agentId", () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "a.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: []
      }));
      writeFileSync(join(dir, "b.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"]
      }));

      expect(() => loadAgentDefinitions(dir)).toThrow(/Duplicate agentId/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
