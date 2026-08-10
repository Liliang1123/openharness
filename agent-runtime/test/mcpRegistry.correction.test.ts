import { describe, expect, it } from "vitest";
import { buildMcpChildEnvironment } from "../src/mcpRegistry";

describe("MCP correction-only security fixture", () => {
  it("passes only safe host variables plus explicit server env to MCP children", () => {
    const childEnv = buildMcpChildEnvironment(
      { SERVER_SPECIFIC_TOKEN: "configured-token" },
      {
        PATH: "/usr/bin",
        HOME: "/tmp/home",
        LANG: "en_US.UTF-8",
        OPENHARNESS_SERVICE_TOKEN: "must-not-reach-mcp",
        ZHIPU_API_KEY: "must-not-reach-mcp",
        CODEX_OAUTH_TOKEN: "must-not-reach-mcp"
      }
    );

    expect(childEnv).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      LANG: "en_US.UTF-8",
      SERVER_SPECIFIC_TOKEN: "configured-token"
    });
    expect(childEnv).not.toHaveProperty("OPENHARNESS_SERVICE_TOKEN");
    expect(childEnv).not.toHaveProperty("ZHIPU_API_KEY");
    expect(childEnv).not.toHaveProperty("CODEX_OAUTH_TOKEN");
  });
});
