import { parentPort, workerData } from "node:worker_threads";

if (!parentPort) throw new Error("fixture requires parent port");

const mode = (workerData as { mode?: string } | undefined)?.mode ?? "exit";

parentPort.on("message", (request: {
  requestId: string;
  operation: string;
}) => {
  if (request.operation === "bootstrap") {
    parentPort!.postMessage({
      requestId: request.requestId,
      ok: true,
      result: {
        schemaVersion: 2,
        integrity: "ok",
        databaseIdentity: { dev: 1, ino: 1 },
        reconciliation: {
          interruptedExecutions: 0,
          invalidatedApprovals: 0
        }
      }
    });
    return;
  }
  if (mode === "malformed") {
    parentPort!.postMessage({
      requestId: request.requestId,
      ok: "not-a-boolean",
      stack: "must not cross the boundary"
    });
    return;
  }
  process.exit(17);
});
