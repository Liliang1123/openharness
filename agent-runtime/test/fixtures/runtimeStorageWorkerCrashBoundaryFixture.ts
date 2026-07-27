import { parentPort } from "node:worker_threads";
import { createRuntimeStorageWorkerKernel } from "../../src/storage/runtimeStorageWorkerKernel";
import { parseStorageWorkerRequest } from "../../src/storage/runtimeStorageWorkerProtocol";

if (!parentPort) throw new Error("fixture requires parent port");

const kernel = createRuntimeStorageWorkerKernel();

parentPort.on("message", (raw: unknown) => {
  const request = parseStorageWorkerRequest(raw);
  try {
    const result = kernel.execute(request);
    parentPort!.postMessage({
      requestId: request.requestId,
      ok: true,
      result
    });
  } catch {
    process.exit(17);
  }
});
