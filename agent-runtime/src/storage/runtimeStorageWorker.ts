import { parentPort } from "node:worker_threads";
import { createRuntimeStorageWorkerKernel } from "./runtimeStorageWorkerKernel";
import {
  parseStorageWorkerRequest,
  type StorageWorkerFailure,
  type StorageWorkerSuccess
} from "./runtimeStorageWorkerProtocol";

if (!parentPort) {
  throw new Error("RUNTIME_STORAGE_WORKER_PARENT_PORT_REQUIRED");
}

const workerPort = parentPort;
const kernel = createRuntimeStorageWorkerKernel();

workerPort.on("message", (raw: unknown) => {
  const fallbackRequestId = requestIdFrom(raw);
  try {
    const request = parseStorageWorkerRequest(raw);
    const response: StorageWorkerSuccess = {
      requestId: request.requestId,
      ok: true,
      result: kernel.execute(request)
    };
    workerPort.postMessage(response);
    if (request.operation === "storage.close") workerPort.close();
  } catch (error) {
    const response: StorageWorkerFailure = {
      requestId: fallbackRequestId,
      ok: false,
      error: safeStorageError(error)
    };
    workerPort.postMessage(response);
  }
});

function requestIdFrom(value: unknown): string {
  if (
    value !== null
    && typeof value === "object"
    && "requestId" in value
    && typeof value.requestId === "string"
    && value.requestId.length > 0
  ) {
    return value.requestId;
  }
  return "invalid-request";
}

function safeStorageError(error: unknown): {
  code: string;
  errorClass: string;
} {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) {
    return {
      code: error.message,
      errorClass: /^[A-Za-z][A-Za-z0-9]*$/.test(error.name) ? error.name : "Error"
    };
  }
  return {
    code: "RUNTIME_STORAGE_OPERATION_FAILED",
    errorClass: "Error"
  };
}
