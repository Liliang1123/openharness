import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

const SAFE_PATH = /^\/(?:[^/\0]+\/)*[^/\0]+$/;
const SAFE_ERROR_CODE = /^[a-z0-9_]+$/;

function validateWorkerData(value) {
  if (!value || typeof value !== "object") throw new Error("invalid_worker_data");
  if (
    typeof value.databasePath !== "string"
    || !isAbsolute(value.databasePath)
    || !SAFE_PATH.test(value.databasePath)
  ) {
    throw new Error("invalid_database_path");
  }
  if (
    typeof value.betterSqlite3Path !== "string"
    || !isAbsolute(value.betterSqlite3Path)
    || !SAFE_PATH.test(value.betterSqlite3Path)
  ) {
    throw new Error("invalid_module_path");
  }
  if (!(value.stopBuffer instanceof SharedArrayBuffer) || value.stopBuffer.byteLength !== 8) {
    throw new Error("invalid_stop_buffer");
  }
  for (const [name, candidate] of [
    ["poll_interval", value.pollIntervalMs],
    ["threshold_frames", value.thresholdFrames],
    ["maximum_wal_bytes", value.maximumWalBytes]
  ]) {
    if (!Number.isSafeInteger(candidate) || candidate <= 0) {
      throw new Error(`invalid_${name}`);
    }
  }
  const databasePath = realpathSync(value.databasePath);
  const betterSqlite3Path = realpathSync(value.betterSqlite3Path);
  if (!lstatSync(databasePath).isFile()) throw new Error("database_not_file");
  if (!lstatSync(betterSqlite3Path).isFile()) throw new Error("module_not_file");
  return {
    databasePath,
    betterSqlite3Path,
    stopBuffer: value.stopBuffer,
    pollIntervalMs: value.pollIntervalMs,
    thresholdFrames: value.thresholdFrames,
    maximumWalBytes: value.maximumWalBytes
  };
}

function checkpointRow(database, mode) {
  const rows = database.pragma(`wal_checkpoint(${mode})`);
  const row = rows[0];
  if (
    !row
    || !Number.isInteger(row.busy)
    || !Number.isInteger(row.log)
    || !Number.isInteger(row.checkpointed)
  ) {
    throw new Error("invalid_checkpoint_result");
  }
  return {
    busy: row.busy,
    logFrames: row.log,
    checkpointedFrames: row.checkpointed,
    backlogFrames: Math.max(0, row.log - row.checkpointed)
  };
}

function walBytes(databasePath) {
  try {
    return statSync(`${databasePath}-wal`).size;
  } catch {
    return 0;
  }
}

function main() {
  if (!parentPort) throw new Error("missing_parent_port");
  const input = validateWorkerData(workerData);
  const require = createRequire(import.meta.url);
  const Database = require(input.betterSqlite3Path);
  const stop = new Int32Array(input.stopBuffer);
  const database = new Database(input.databasePath, { fileMustExist: true });
  const metrics = {
    noopPolls: 0,
    passiveAttempts: 0,
    passiveBusy: 0,
    passiveTotalDurationMs: 0,
    passiveMaxDurationMs: 0,
    maximumLogFrames: 0,
    maximumCheckpointedFrames: 0,
    maximumBacklogFrames: 0,
    maximumWalBytes: walBytes(input.databasePath),
    finalRuntimeCheckpoint: null
  };

  try {
    database.pragma("wal_autocheckpoint = 0");
    database.pragma("busy_timeout = 0");
    database.pragma("synchronous = NORMAL");
    const journalMode = String(database.pragma("journal_mode", { simple: true })).toLowerCase();
    const synchronous = Number(database.pragma("synchronous", { simple: true }));
    const walAutocheckpoint = Number(database.pragma("wal_autocheckpoint", { simple: true }));
    if (journalMode !== "wal") throw new Error("worker_database_not_wal");
    if (synchronous !== 1) throw new Error("worker_synchronous_mismatch");
    if (walAutocheckpoint !== 0) throw new Error("worker_autocheckpoint_not_disabled");
    parentPort.postMessage({
      kind: "ready",
      journalMode,
      synchronous,
      walAutocheckpoint,
      pollIntervalMs: input.pollIntervalMs,
      thresholdFrames: input.thresholdFrames,
      maximumWalBytes: input.maximumWalBytes
    });

    while (Atomics.load(stop, 0) === 0) {
      const observed = checkpointRow(database, "NOOP");
      metrics.noopPolls += 1;
      recordCheckpointMetrics(metrics, observed, walBytes(input.databasePath));
      if (metrics.maximumWalBytes > input.maximumWalBytes) {
        throw new Error("wal_size_limit_exceeded");
      }
      if (observed.backlogFrames >= input.thresholdFrames) {
        runPassiveCheckpoint(database, input.databasePath, metrics);
      }
      Atomics.wait(stop, 0, 0, input.pollIntervalMs);
    }

    metrics.finalRuntimeCheckpoint = runPassiveCheckpoint(
      database,
      input.databasePath,
      metrics
    );
    database.pragma("busy_timeout = 5000");
    const shutdownStartedAt = performance.now();
    const shutdown = checkpointRow(database, "TRUNCATE");
    const shutdownDurationMs = performance.now() - shutdownStartedAt;
    const finalWalBytes = walBytes(input.databasePath);
    if (
      shutdown.busy !== 0
      || shutdown.logFrames !== 0
      || shutdown.checkpointedFrames !== 0
      || finalWalBytes !== 0
    ) {
      throw new Error("shutdown_checkpoint_incomplete");
    }
    parentPort.postMessage({
      kind: "summary",
      result: "pass",
      runtime: metrics,
      shutdown: {
        ...shutdown,
        durationMs: shutdownDurationMs,
        finalWalBytes
      }
    });
  } finally {
    database.close();
  }
}

function runPassiveCheckpoint(database, databasePath, metrics) {
  const startedAt = performance.now();
  const observed = checkpointRow(database, "PASSIVE");
  const durationMs = performance.now() - startedAt;
  metrics.passiveAttempts += 1;
  metrics.passiveBusy += observed.busy;
  metrics.passiveTotalDurationMs += durationMs;
  metrics.passiveMaxDurationMs = Math.max(metrics.passiveMaxDurationMs, durationMs);
  recordCheckpointMetrics(metrics, observed, walBytes(databasePath));
  return {
    ...observed,
    durationMs,
    walBytes: walBytes(databasePath)
  };
}

function recordCheckpointMetrics(metrics, observed, observedWalBytes) {
  metrics.maximumLogFrames = Math.max(metrics.maximumLogFrames, observed.logFrames);
  metrics.maximumCheckpointedFrames = Math.max(
    metrics.maximumCheckpointedFrames,
    observed.checkpointedFrames
  );
  metrics.maximumBacklogFrames = Math.max(metrics.maximumBacklogFrames, observed.backlogFrames);
  metrics.maximumWalBytes = Math.max(metrics.maximumWalBytes, observedWalBytes);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  if (parentPort) {
    parentPort.postMessage({
      kind: "failure",
      result: "blocked",
      errorClass: error instanceof Error ? error.name : "UnknownError",
      errorCode: SAFE_ERROR_CODE.test(message) ? message : "unexpected_error"
    });
  }
  process.exitCode = 2;
}
