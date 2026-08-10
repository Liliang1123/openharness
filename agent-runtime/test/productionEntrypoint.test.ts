import { describe, expect, it } from "vitest";
import { main, resolveProductionRuntimeConfig } from "../src/productionEntrypoint";

describe("production Runtime entrypoint configuration", () => {
  it("rejects non-production profile, relative database path, and missing service token", () => {
    expect(() => resolveProductionRuntimeConfig({})).toThrow(/profile/i);
    expect(() => resolveProductionRuntimeConfig({
      AGENT_RUNTIME_PROFILE: "production",
      AGENT_RUNTIME_SQLITE_PATH: "relative/runtime.sqlite",
      OPENHARNESS_SERVICE_TOKEN: "service-token"
    })).toThrow(/absolute/i);
    expect(() => resolveProductionRuntimeConfig({
      AGENT_RUNTIME_PROFILE: "production",
      AGENT_RUNTIME_SQLITE_PATH: "/tmp/runtime.sqlite"
    })).toThrow(/service token/i);
  });

  it("returns a validated production config without listening", () => {
    expect(resolveProductionRuntimeConfig({
      AGENT_RUNTIME_PROFILE: "production",
      AGENT_RUNTIME_SQLITE_PATH: "/tmp/runtime.sqlite",
      OPENHARNESS_SERVICE_TOKEN: "service-token",
      HOST: "127.0.0.1",
      PORT: "3101"
    })).toEqual({
      databasePath: "/tmp/runtime.sqlite",
      serviceToken: "service-token",
      host: "127.0.0.1",
      port: 3101
    });
  });

  it("closes the production app when listen fails", async () => {
    let closeCount = 0;
    await expect(main({
      env: productionEnv(),
      createApp: async () => ({
        listen: async () => { throw new Error("listen failed"); },
        close: async () => { closeCount += 1; }
      }),
      registerSignal: () => undefined
    })).rejects.toThrow("listen failed");
    expect(closeCount).toBe(1);
  });

  it("registers idempotent signal shutdown after production construction", async () => {
    let closeCount = 0;
    const handlers = new Map<NodeJS.Signals, () => void>();
    await main({
      env: productionEnv(),
      createApp: async () => ({
        listen: async () => undefined,
        close: async () => { closeCount += 1; }
      }),
      registerSignal: (signal, handler) => handlers.set(signal, handler)
    });

    handlers.get("SIGTERM")!();
    handlers.get("SIGINT")!();
    await Promise.resolve();
    expect(closeCount).toBe(1);
  });
});

function productionEnv(): NodeJS.ProcessEnv {
  return {
    AGENT_RUNTIME_PROFILE: "production",
    AGENT_RUNTIME_SQLITE_PATH: "/tmp/runtime.sqlite",
    OPENHARNESS_SERVICE_TOKEN: "service-token"
  };
}
