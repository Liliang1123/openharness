import { isAbsolute } from "node:path";
import { createProductionServer } from "./server";

export interface ProductionRuntimeConfig {
  databasePath: string;
  serviceToken: string;
  host: string;
  port: number;
}

interface ProductionApp {
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface ProductionMainOptions {
  env?: NodeJS.ProcessEnv;
  createApp?: (options: { databasePath: string; serviceToken: string }) => Promise<ProductionApp>;
  registerSignal?: (signal: NodeJS.Signals, handler: () => void) => void;
}

export function resolveProductionRuntimeConfig(env: NodeJS.ProcessEnv): ProductionRuntimeConfig {
  if (env.AGENT_RUNTIME_PROFILE !== "production") {
    throw new Error("AGENT_RUNTIME_PROFILE=production is required");
  }

  const databasePath = env.AGENT_RUNTIME_SQLITE_PATH?.trim();
  if (!databasePath || !isAbsolute(databasePath)) {
    throw new Error("Production Runtime SQLite path must be absolute");
  }

  const serviceToken = env.OPENHARNESS_SERVICE_TOKEN?.trim();
  if (!serviceToken) throw new Error("Production Runtime service token is required");

  const host = env.HOST?.trim() || "0.0.0.0";
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Production Runtime port must be an integer from 1 to 65535");
  }

  return { databasePath, serviceToken, host, port };
}

export async function main(options: ProductionMainOptions = {}): Promise<ProductionApp> {
  const config = resolveProductionRuntimeConfig(options.env ?? process.env);
  const createApp = options.createApp ?? createProductionServer;
  const app = await createApp({
    databasePath: config.databasePath,
    serviceToken: config.serviceToken
  });

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
