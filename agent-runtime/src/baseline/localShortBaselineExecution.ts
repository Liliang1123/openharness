import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { RuntimeBaselineReport } from "@openharness/shared-schema";
import { collectRuntimeBaselineSample, type RuntimeBaselineEventObservation } from "./localBaseline";
import {
  createTwentyFourHourLocalSoakConfig,
  createThirtyMinuteLocalBaselineConfig,
  runDeterministicLocalShortBaseline,
  writeRuntimeBaselineReport,
  type LocalShortBaselineConfig
} from "./localShortBaselineRunner";
import {
  migrateRuntimeDatabase,
  openRuntimeDatabase,
  type RuntimeDatabase,
  type RuntimeTransaction
} from "../storage/runtimeStorage";

const DEFAULT_OUTPUT_DIR = join(process.cwd(), "docs/verification/agent-runtime-v1/baseline");
const DEFAULT_DATABASE_DIR_PREFIX = "openharness-local-baseline-";
const DEFAULT_READ_PROBES = 20;

export interface RunLocalThirtyMinuteBaselineInput {
  outputPath?: string;
  databasePath?: string;
  generatedAt?: string;
  durationMs?: number;
  sampleIntervalMs?: number;
  restartAtMs?: number;
  restartScheduleMs?: number[];
  allowCompressedScheduleForTest?: boolean;
  seededConversations?: number;
  concurrency?: number;
  delayMs?: (ms: number) => Promise<void> | void;
  readRssBytes?: () => number;
  readOpenFileDescriptors?: () => number;
  overwrite?: boolean;
}

export interface RunLocalThirtyMinuteBaselineResult {
  report: RuntimeBaselineReport;
  outputPath: string;
  databasePath: string;
  restartEvents: { elapsedMs: number; sampleIndex: number }[];
}

export async function runLocalThirtyMinuteBaseline(
  input: RunLocalThirtyMinuteBaselineInput = {}
): Promise<RunLocalThirtyMinuteBaselineResult> {
  return runLocalBaselineExecution({
    input,
    outputSuffix: "local-short-baseline",
    baselineKind: "deterministic-local-short-baseline",
    createConfig: ({ generatedAt, environment }) => createThirtyMinuteLocalBaselineConfig({
      generatedAt,
      environment,
      durationMs: input.durationMs,
      sampleIntervalMs: input.sampleIntervalMs,
      restartAtMs: input.restartAtMs,
      seededConversations: input.seededConversations,
      concurrency: input.concurrency
    })
  });
}

export async function runLocalTwentyFourHourSoak(
  input: RunLocalThirtyMinuteBaselineInput = {}
): Promise<RunLocalThirtyMinuteBaselineResult> {
  return runLocalBaselineExecution({
    input,
    outputSuffix: "local-24h-soak",
    baselineKind: "fixed-24-hour-local-soak",
    createConfig: ({ generatedAt, environment }) => createTwentyFourHourLocalSoakConfig({
      generatedAt,
      environment,
      durationMs: input.durationMs,
      sampleIntervalMs: input.sampleIntervalMs,
      restartScheduleMs: input.restartScheduleMs,
      allowCompressedScheduleForTest: input.allowCompressedScheduleForTest,
      seededConversations: input.seededConversations,
      concurrency: input.concurrency
    })
  });
}

interface RunLocalBaselineExecutionInput {
  input: RunLocalThirtyMinuteBaselineInput;
  outputSuffix: string;
  baselineKind: string;
  createConfig(input: { generatedAt: string; environment: Record<string, unknown> }): LocalShortBaselineConfig;
}

async function runLocalBaselineExecution(
  options: RunLocalBaselineExecutionInput
): Promise<RunLocalThirtyMinuteBaselineResult> {
  const input = options.input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const databasePath = input.databasePath ?? join(mkdtempSync(join(tmpdir(), DEFAULT_DATABASE_DIR_PREFIX)), "runtime-baseline.db");
  const outputPath = input.outputPath ?? join(DEFAULT_OUTPUT_DIR, `${generatedAt.replace(/[:.]/g, "-")}-${options.outputSuffix}.json`);
  let database = openRuntimeDatabase(databasePath);
  migrateRuntimeDatabase(database);

  const restartEvents: { elapsedMs: number; sampleIndex: number }[] = [];
  const config = options.createConfig({
    generatedAt,
    environment: {
      track: "local",
      baselineKind: options.baselineKind,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      databasePath,
      restartEvents
    }
  });

  try {
    seedRuntimeDatabase(database, config.workload.operations, Date.parse(generatedAt));
    const report = await runDeterministicLocalShortBaseline({
      ...config,
      delayMs: input.delayMs ?? sleep,
      onRestart: ({ elapsedMs, sampleIndex }) => {
        database.close();
        database = openRuntimeDatabase(databasePath);
        migrateRuntimeDatabase(database);
        restartEvents.push({ elapsedMs, sampleIndex });
      },
      sample: ({ sampleIndex, sampledAt, workload }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: measureReadLatencies(database, "SELECT COUNT(*) AS count FROM conversations"),
          durableReplayLatenciesMs: measureReadLatencies(database, "SELECT COUNT(*) AS count FROM runtime_events"),
          database,
          readRssBytes: input.readRssBytes,
          readOpenFileDescriptors: input.readOpenFileDescriptors,
          mcpChildCount: 0,
          operations: sampleIndex === 0 ? workload.operations : undefined,
          eventObservations: sampleIndex === 0 ? buildEventObservations(workload.operations) : undefined
        })
    });
    writeRuntimeBaselineReport(report, outputPath, { overwrite: input.overwrite });
    return { report, outputPath, databasePath, restartEvents };
  } finally {
    database.close();
  }
}

function seedRuntimeDatabase(
  database: RuntimeDatabase,
  operations: { operationId: string; tenantId: string; userId: string; conversationId: string; kind: string }[],
  createdAt: number
): void {
  database.transaction((tx) => {
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      tx.run(
        "INSERT OR IGNORE INTO conversations(tenant_id,user_id,conversation_id,title,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        [operation.tenantId, operation.userId, operation.conversationId, `Baseline ${operation.conversationId}`, createdAt, createdAt]
      );
      tx.run(
        "INSERT OR IGNORE INTO messages(tenant_id,user_id,conversation_id,seq,role,content_json,created_at) VALUES (?,?,?,?,?,?,?)",
        [operation.tenantId, operation.userId, operation.conversationId, 1, "user", JSON.stringify({ kind: operation.kind }), createdAt]
      );
      tx.run(
        "INSERT OR IGNORE INTO executions(execution_id,tenant_id,user_id,conversation_id,status,stop_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        [`exec-${operation.operationId}`, operation.tenantId, operation.userId, operation.conversationId, "completed", null, createdAt, createdAt]
      );
      tx.run(
        "INSERT OR IGNORE INTO runtime_events(tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          operation.tenantId,
          operation.userId,
          operation.conversationId,
          `event-${operation.operationId}`,
          `exec-${operation.operationId}`,
          index + 1,
          "agent_stop",
          JSON.stringify({ operationId: operation.operationId, kind: operation.kind }),
          createdAt
        ]
      );
    }
  });
}

function measureReadLatencies(database: RuntimeTransaction, sql: string): number[] {
  const latencies: number[] = [];
  for (let index = 0; index < DEFAULT_READ_PROBES; index += 1) {
    const startedAt = performance.now();
    database.get(sql);
    latencies.push(Math.max(0, performance.now() - startedAt));
  }
  return latencies;
}

function buildEventObservations(
  operations: { operationId: string; tenantId: string; userId: string; conversationId: string }[]
): RuntimeBaselineEventObservation[] {
  return operations.map((operation, index) => ({
    tenantId: operation.tenantId,
    userId: operation.userId,
    conversationId: operation.conversationId,
    cursor: index + 1,
    eventId: `event-${operation.operationId}`
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
