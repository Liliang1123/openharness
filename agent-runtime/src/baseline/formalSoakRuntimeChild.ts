import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { loadMcpConfigFile, McpRegistry } from "../mcpRegistry";
import { createProductionServer } from "../server";
import type { RuntimeDatabaseIdentity } from "../storage/runtimeStorage";

const EXPECTED_DATABASE_DEV_ENV = "GATE_D_EXPECTED_DATABASE_DEV";
const EXPECTED_DATABASE_INO_ENV = "GATE_D_EXPECTED_DATABASE_INO";

export interface GateDRuntimeChildConfig {
  databasePath: string;
  expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
  mcpConfigPath: string;
  javaBaseUrl: string;
  serviceToken: string;
  host: "127.0.0.1";
  port: number;
}

interface GateDRuntimeChildApp {
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface GateDRuntimeChildMainOptions {
  env?: NodeJS.ProcessEnv;
  createApp?: (config: GateDRuntimeChildConfig, registry: McpRegistry) => Promise<GateDRuntimeChildApp>;
  registerSignal?: (signal: NodeJS.Signals, handler: () => void) => void;
}

export function resolveGateDRuntimeChildConfig(env: NodeJS.ProcessEnv): GateDRuntimeChildConfig {
  if (env.AGENT_RUNTIME_PROFILE !== "production") {
    throw new Error("AGENT_RUNTIME_PROFILE=production is required for the Gate D Runtime child");
  }
  const databasePath = requiredAbsolutePath(env.AGENT_RUNTIME_SQLITE_PATH, "SQLite");
  const expectedDatabaseIdentity = parseExpectedDatabaseIdentity(env);
  const mcpConfigPath = requiredAbsolutePath(env.GATE_D_MCP_CONFIG_PATH, "MCP config");
  const serviceToken = env.OPENHARNESS_SERVICE_TOKEN?.trim();
  if (!serviceToken) throw new Error("Gate D Runtime child service token is required");
  const javaBaseUrl = loopbackHttpUrl(env.JAVA_BACKEND_URL ?? "http://127.0.0.1:8080", "Java Backend");
  const host = env.HOST?.trim() || "127.0.0.1";
  if (host !== "127.0.0.1") throw new Error("Gate D Runtime child host must be 127.0.0.1");
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Gate D Runtime child port must be an integer from 1 to 65535");
  }
  return {
    databasePath,
    ...(expectedDatabaseIdentity ? { expectedDatabaseIdentity } : {}),
    mcpConfigPath,
    javaBaseUrl,
    serviceToken,
    host,
    port
  };
}

export async function main(options: GateDRuntimeChildMainOptions = {}): Promise<GateDRuntimeChildApp> {
  const config = resolveGateDRuntimeChildConfig(options.env ?? process.env);
  const registry = new McpRegistry(loadMcpConfigFile(config.mcpConfigPath));
  await registry.init();
  try {
    await registry.getVirtualSkill("mcp:qualification");
  } catch {
    await registry.shutdown();
    throw new Error("Gate D MCP qualification fixture is not ready");
  }
  if (registry.getServerForTool("qualification_echo") !== "qualification") {
    await registry.shutdown();
    throw new Error("Gate D MCP qualification fixture is not ready");
  }

  let app: GateDRuntimeChildApp;
  try {
    app = options.createApp
      ? await options.createApp(config, registry)
      : await createProductionServer({
          databasePath: config.databasePath,
          expectedDatabaseIdentity: config.expectedDatabaseIdentity,
          serviceToken: config.serviceToken,
          javaBaseUrl: config.javaBaseUrl,
          mcpRegistry: registry
        });
  } catch (error) {
    await registry.shutdown();
    throw error;
  }

  let closePromise: Promise<unknown> | undefined;
  const closeOnce = () => {
    closePromise ??= app.close();
    void closePromise.catch(() => undefined);
  };
  const registerSignal = options.registerSignal
    ?? ((signal: NodeJS.Signals, handler: () => void) => process.once(signal, handler));
  registerSignal("SIGINT", closeOnce);
  registerSignal("SIGTERM", closeOnce);

  try {
    await app.listen({ host: config.host, port: config.port });
    return app;
  } catch (error) {
    closeOnce();
    await closePromise;
    throw error;
  }
}

function parseExpectedDatabaseIdentity(env: NodeJS.ProcessEnv): RuntimeDatabaseIdentity | undefined {
  const rawDev = env[EXPECTED_DATABASE_DEV_ENV];
  const rawIno = env[EXPECTED_DATABASE_INO_ENV];
  if (rawDev === undefined && rawIno === undefined) return undefined;
  if (!validIdentityInteger(rawDev) || !validIdentityInteger(rawIno)) {
    throw new Error("Gate D Runtime child database identity is invalid");
  }
  return { dev: Number(rawDev), ino: Number(rawIno) };
}

function validIdentityInteger(value: string | undefined): value is string {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0;
}

function requiredAbsolutePath(value: string | undefined, label: string): string {
  const path = value?.trim();
  if (!path || !isAbsolute(path)) throw new Error(`Gate D ${label} path must be absolute`);
  return path;
}

function loopbackHttpUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} URL must be an absolute loopback HTTP URL`);
  }
  if (parsed.protocol !== "http:" || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")) {
    throw new Error(`${label} URL must be an absolute loopback HTTP URL`);
  }
  return parsed.origin;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
