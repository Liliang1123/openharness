import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  statfsSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { RuntimeBaselineReportSchema, type RuntimeBaselineReport } from "@openharness/shared-schema";
import { loadMcpConfigFile, McpRegistry } from "../mcpRegistry";
import {
  createGateDEvidenceJournal,
  executeGateDProductionSoak,
  writeGateDReportNoOverwrite,
  type GateDEvidenceJournal
} from "./formalSoakExecution";
import { buildDeterministicBaselineWorkload, createRuntimeBaselineReport } from "./localBaseline";

const APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_FLAGS = [
  "--project-root",
  "--run-id",
  "--approval-file",
  "--plan",
  "--java-url",
  "--mcp-config",
  "--sqlite-path",
  "--report",
  "--partial-report",
  "--journal",
  "--preflight-output",
  "--monitoring-evidence",
  "--interruption-procedure",
  "--minimum-disk-headroom-bytes"
] as const;

interface GateDStartApproval {
  schemaVersion: 1;
  changeId: "harden-agent-runtime-single-node-production";
  approved: true;
  approvedBy: string;
  approvedAt: string;
  runId: string;
  planSha256: string;
  reason: string;
}

interface GateDPreflightOptions {
  projectRoot: string;
  runId: string;
  approvalFile: string;
  plan: string;
  javaUrl: string;
  mcpConfig: string;
  sqlitePath: string;
  report: string;
  partialReport: string;
  journal: string;
  preflightOutput: string;
  monitoringEvidence: string;
  interruptionProcedure: string;
  minimumDiskHeadroomBytes: number;
}

export interface GateDPreflightCliDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  probeJava?: (input: { javaUrl: string; serviceToken: string }) => Promise<void>;
  probeMcp?: (mcpConfigPath: string) => Promise<void>;
  diskHeadroomBytes?: (path: string) => number | GateDDiskHeadroom;
  writeOutput?: (value: string) => void;
  writeError?: (value: string) => void;
}

export interface GateDDiskHeadroom {
  bytes: number;
  ratio: number;
}

export interface GateDProductionSoakInput {
  runId: string;
  projectRoot: string;
  javaUrl: string;
  mcpConfigPath: string;
  sqlitePath: string;
  reportPath: string;
  partialReportPath: string;
  serviceToken: string;
  approval: GateDStartApproval;
  preflightArtifact: Record<string, unknown>;
  journal: GateDEvidenceJournal;
}

export interface GateDRunCliDependencies extends GateDPreflightCliDependencies {
  executeProductionSoak?: (input: GateDProductionSoakInput) => Promise<RuntimeBaselineReport>;
}

export async function runGateDPreflightCli(
  argv: string[],
  dependencies: GateDPreflightCliDependencies = {}
): Promise<number> {
  const writeOutput = dependencies.writeOutput ?? (value => process.stdout.write(`${value}\n`));
  const writeError = dependencies.writeError ?? (value => process.stderr.write(`${value}\n`));
  try {
    const options = parsePreflightArgs(argv);
    const root = realpathSync(options.projectRoot);
    const paths = {
      approvalFile: canonicalInput(root, options.approvalFile, "approval file"),
      plan: canonicalInput(root, options.plan, "plan"),
      mcpConfig: canonicalInput(root, options.mcpConfig, "MCP config"),
      sqlitePath: canonicalInput(root, options.sqlitePath, "SQLite path"),
      monitoringEvidence: canonicalInput(root, options.monitoringEvidence, "monitoring evidence"),
      interruptionProcedure: canonicalInput(root, options.interruptionProcedure, "interruption procedure"),
      report: canonicalOutput(root, options.report, "report"),
      partialReport: canonicalOutput(root, options.partialReport, "partial report"),
      journal: canonicalOutput(root, options.journal, "journal"),
      preflightOutput: canonicalOutput(root, options.preflightOutput, "preflight output")
    };
    assertUniqueOutputs([paths.report, paths.partialReport, paths.journal, paths.preflightOutput]);

    const planBytes = readFileSync(paths.plan);
    const planSha256 = sha256(planBytes);
    const approvalBytes = readFileSync(paths.approvalFile);
    const approval = parseApproval(approvalBytes, dependencies.now?.() ?? new Date());
    if (approval.runId !== options.runId) throw new Error("Gate D approval runId mismatch");
    if (approval.planSha256 !== planSha256) throw new Error("Gate D approval plan SHA mismatch");

    const serviceToken = (dependencies.env ?? process.env).OPENHARNESS_SERVICE_TOKEN?.trim();
    if (!serviceToken) throw new Error("Gate D service token is required after approval validation");
    const javaUrl = loopbackHttpUrl(options.javaUrl);
    const probeJava = dependencies.probeJava ?? probeGateDJavaFixtures;
    const probeMcp = dependencies.probeMcp ?? probeGateDMcpFixture;
    const diskHeadroomBytes = dependencies.diskHeadroomBytes ?? defaultDiskHeadroomBytes;
    await probeJava({ javaUrl, serviceToken });
    await probeMcp(paths.mcpConfig);
    const observedDiskHeadroom = normalizeDiskHeadroom(diskHeadroomBytes(dirname(paths.report)));
    if (observedDiskHeadroom.bytes < options.minimumDiskHeadroomBytes || observedDiskHeadroom.ratio < 0.10) {
      throw new Error("Gate D disk headroom is insufficient");
    }

    const artifact = {
      schemaVersion: 1,
      changeId: "harden-agent-runtime-single-node-production",
      runId: options.runId,
      result: "pass",
      generatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      planSha256,
      approvalSha256: sha256(approvalBytes),
      bindings: {
        approvalFile: projectRelative(root, paths.approvalFile),
        plan: projectRelative(root, paths.plan),
        mcpConfig: projectRelative(root, paths.mcpConfig),
        sqlitePath: projectRelative(root, paths.sqlitePath),
        report: projectRelative(root, paths.report),
        partialReport: projectRelative(root, paths.partialReport),
        journal: projectRelative(root, paths.journal),
        monitoringEvidenceSha256: sha256(readFileSync(paths.monitoringEvidence)),
        interruptionProcedureSha256: sha256(readFileSync(paths.interruptionProcedure))
      },
      probes: {
        javaGateway: "pass",
        mcpFixture: "pass",
        diskHeadroom: "pass"
      },
      diskHeadroomBytes: observedDiskHeadroom.bytes,
      diskHeadroomRatio: observedDiskHeadroom.ratio,
      minimumDiskHeadroomBytes: options.minimumDiskHeadroomBytes
    };
    writeJsonNoOverwrite(paths.preflightOutput, artifact);
    writeOutput(JSON.stringify({ result: "pass", runId: options.runId, artifact: basename(paths.preflightOutput) }));
    return 0;
  } catch (error) {
    writeError(JSON.stringify({ result: "blocked", errorClass: classifyError(error) }));
    return 2;
  }
}

export async function runGateDRunCli(
  argv: string[],
  dependencies: GateDRunCliDependencies = {}
): Promise<number> {
  const writeOutput = dependencies.writeOutput ?? (value => process.stdout.write(`${value}\n`));
  const writeError = dependencies.writeError ?? (value => process.stderr.write(`${value}\n`));
  try {
    const options = parsePreflightArgs(argv);
    const now = dependencies.now?.() ?? new Date();
    const root = realpathSync(options.projectRoot);
    const paths = {
      approvalFile: canonicalInput(root, options.approvalFile, "approval file"),
      plan: canonicalInput(root, options.plan, "plan"),
      mcpConfig: canonicalInput(root, options.mcpConfig, "MCP config"),
      sqlitePath: canonicalInput(root, options.sqlitePath, "SQLite path"),
      monitoringEvidence: canonicalInput(root, options.monitoringEvidence, "monitoring evidence"),
      interruptionProcedure: canonicalInput(root, options.interruptionProcedure, "interruption procedure"),
      preflightOutput: canonicalInput(root, options.preflightOutput, "preflight output"),
      report: canonicalOutput(root, options.report, "report"),
      partialReport: canonicalOutput(root, options.partialReport, "partial report"),
      journal: canonicalOutput(root, options.journal, "journal")
    };
    assertUniqueOutputs([paths.report, paths.partialReport, paths.journal]);

    const planBytes = readFileSync(paths.plan);
    const planSha256 = sha256(planBytes);
    const approvalBytes = readFileSync(paths.approvalFile);
    const approval = parseApproval(approvalBytes, now);
    if (approval.runId !== options.runId) throw new Error("Gate D approval runId mismatch");
    if (approval.planSha256 !== planSha256) throw new Error("Gate D approval plan SHA mismatch");
    const preflightBytes = readFileSync(paths.preflightOutput);
    const preflightArtifact = parsePreflightArtifact(preflightBytes, now);
    assertPreflightBinding(preflightArtifact, {
      root,
      options,
      paths,
      planSha256,
      approvalSha256: sha256(approvalBytes)
    });

    const serviceToken = (dependencies.env ?? process.env).OPENHARNESS_SERVICE_TOKEN?.trim();
    if (!serviceToken) throw new Error("Gate D service token is required after approval validation");
    const javaUrl = loopbackHttpUrl(options.javaUrl);
    await (dependencies.probeJava ?? probeGateDJavaFixtures)({ javaUrl, serviceToken });
    await (dependencies.probeMcp ?? probeGateDMcpFixture)(paths.mcpConfig);
    const observedDiskHeadroom = normalizeDiskHeadroom(
      (dependencies.diskHeadroomBytes ?? defaultDiskHeadroomBytes)(dirname(paths.report))
    );
    if (observedDiskHeadroom.bytes < options.minimumDiskHeadroomBytes || observedDiskHeadroom.ratio < 0.10) {
      throw new Error("Gate D disk headroom is insufficient");
    }

    const journal = createGateDEvidenceJournal(paths.journal);
    journal.append({ kind: "gate_d_run_started", runId: options.runId, generatedAt: now.toISOString() });
    let report: RuntimeBaselineReport | undefined;
    try {
      try {
        const executeProductionSoak = dependencies.executeProductionSoak ?? executeGateDProductionSoak;
        report = await executeProductionSoak({
          runId: options.runId,
          projectRoot: root,
          javaUrl,
          mcpConfigPath: paths.mcpConfig,
          sqlitePath: paths.sqlitePath,
          reportPath: paths.report,
          partialReportPath: paths.partialReport,
          serviceToken,
          approval,
          preflightArtifact,
          journal
        });
        assertFormalGateDReport(report);
      } catch {
        report = executorFailureReport(now.toISOString());
        assertFormalGateDReport(report);
      }
      journal.append({
        kind: "gate_d_run_finished",
        runId: options.runId,
        result: report.result,
        reportHash: report.reportHash
      });
    } finally {
      journal.close();
    }
    if (!report) throw new Error("Gate D executor did not produce a report");

    const target = report.result === "pass" ? paths.report : paths.partialReport;
    writeGateDReportNoOverwrite(report, target);
    writeOutput(JSON.stringify({ result: report.result, runId: options.runId, artifact: basename(target) }));
    return report.result === "pass" ? 0 : 1;
  } catch (error) {
    writeError(JSON.stringify({ result: "blocked", errorClass: classifyError(error) }));
    return 2;
  }
}

function parsePreflightArgs(argv: string[]): GateDPreflightOptions {
  const values = argv[0] === "--" ? argv.slice(1) : [...argv];
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag || !REQUIRED_FLAGS.includes(flag as typeof REQUIRED_FLAGS[number])) {
      throw new Error("Unknown Gate D preflight flag");
    }
    if (value === undefined || value.startsWith("--")) throw new Error("Missing Gate D preflight flag value");
    if (parsed.has(flag)) throw new Error("Duplicate Gate D preflight flag");
    parsed.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!parsed.has(flag)) throw new Error(`Missing Gate D preflight flag ${flag}`);
  }
  const runId = parsed.get("--run-id")!;
  if (!RUN_ID.test(runId)) throw new Error("Gate D runId is invalid");
  const minimumDiskHeadroomBytes = Number(parsed.get("--minimum-disk-headroom-bytes"));
  if (!Number.isSafeInteger(minimumDiskHeadroomBytes) || minimumDiskHeadroomBytes < 2 * 1024 * 1024 * 1024) {
    throw new Error("Gate D minimum disk headroom must be at least 2 GiB");
  }
  return {
    projectRoot: parsed.get("--project-root")!,
    runId,
    approvalFile: parsed.get("--approval-file")!,
    plan: parsed.get("--plan")!,
    javaUrl: parsed.get("--java-url")!,
    mcpConfig: parsed.get("--mcp-config")!,
    sqlitePath: parsed.get("--sqlite-path")!,
    report: parsed.get("--report")!,
    partialReport: parsed.get("--partial-report")!,
    journal: parsed.get("--journal")!,
    preflightOutput: parsed.get("--preflight-output")!,
    monitoringEvidence: parsed.get("--monitoring-evidence")!,
    interruptionProcedure: parsed.get("--interruption-procedure")!,
    minimumDiskHeadroomBytes
  };
}

function parseApproval(bytes: Buffer, now: Date): GateDStartApproval {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Gate D approval is not valid JSON");
  }
  if (!isRecord(value)) throw new Error("Gate D approval must be an object");
  const allowed = new Set(["schemaVersion", "changeId", "approved", "approvedBy", "approvedAt", "runId", "planSha256", "reason"]);
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error("Gate D approval contains unknown fields");
  if (
    value.schemaVersion !== 1 || value.changeId !== "harden-agent-runtime-single-node-production" || value.approved !== true ||
    !nonBlank(value.approvedBy) || !nonBlank(value.approvedAt) || !nonBlank(value.runId) || !RUN_ID.test(value.runId) ||
    !nonBlank(value.planSha256) || !SHA256.test(value.planSha256) || !nonBlank(value.reason)
  ) {
    throw new Error("Gate D approval is invalid");
  }
  const approvedAt = Date.parse(value.approvedAt);
  if (Number.isNaN(approvedAt) || approvedAt > now.getTime() + 5 * 60 * 1000 || now.getTime() - approvedAt > APPROVAL_MAX_AGE_MS) {
    throw new Error("Gate D approval is expired or future-dated");
  }
  return value as unknown as GateDStartApproval;
}

function parsePreflightArtifact(bytes: Buffer, now: Date): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Gate D preflight artifact is not valid JSON");
  }
  if (!isRecord(value)) throw new Error("Gate D preflight artifact must be an object");
  const allowed = new Set([
    "schemaVersion", "changeId", "runId", "result", "generatedAt", "planSha256", "approvalSha256",
    "bindings", "probes", "diskHeadroomBytes", "diskHeadroomRatio", "minimumDiskHeadroomBytes"
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new Error("Gate D preflight artifact contains unknown fields");
  }
  if (
    value.schemaVersion !== 1 || value.changeId !== "harden-agent-runtime-single-node-production" ||
    value.result !== "pass" || !nonBlank(value.runId) || !RUN_ID.test(value.runId) ||
    !nonBlank(value.generatedAt) || !nonBlank(value.planSha256) || !SHA256.test(value.planSha256) ||
    !nonBlank(value.approvalSha256) || !SHA256.test(value.approvalSha256) ||
    !isRecord(value.bindings) || !isRecord(value.probes) ||
    value.probes.javaGateway !== "pass" || value.probes.mcpFixture !== "pass" || value.probes.diskHeadroom !== "pass" ||
    !Number.isSafeInteger(value.diskHeadroomBytes) || !Number.isSafeInteger(value.minimumDiskHeadroomBytes) ||
    typeof value.diskHeadroomRatio !== "number" || !Number.isFinite(value.diskHeadroomRatio) ||
    value.diskHeadroomRatio < 0 || value.diskHeadroomRatio > 1
  ) {
    throw new Error("Gate D preflight artifact is invalid");
  }
  const generatedAt = Date.parse(value.generatedAt);
  if (
    Number.isNaN(generatedAt) || generatedAt > now.getTime() + 5 * 60 * 1000 ||
    now.getTime() - generatedAt > APPROVAL_MAX_AGE_MS
  ) {
    throw new Error("Gate D preflight artifact is expired or future-dated");
  }
  return value;
}

interface GateDValidatedPaths {
  approvalFile: string;
  plan: string;
  mcpConfig: string;
  sqlitePath: string;
  monitoringEvidence: string;
  interruptionProcedure: string;
  preflightOutput: string;
  report: string;
  partialReport: string;
  journal: string;
}

function assertPreflightBinding(
  artifact: Record<string, unknown>,
  input: {
    root: string;
    options: GateDPreflightOptions;
    paths: GateDValidatedPaths;
    planSha256: string;
    approvalSha256: string;
  }
): void {
  if (
    artifact.runId !== input.options.runId || artifact.planSha256 !== input.planSha256 ||
    artifact.approvalSha256 !== input.approvalSha256 ||
    artifact.minimumDiskHeadroomBytes !== input.options.minimumDiskHeadroomBytes
  ) {
    throw new Error("Gate D preflight binding mismatch");
  }
  const bindings = artifact.bindings as Record<string, unknown>;
  const expected: Record<string, string> = {
    approvalFile: projectRelative(input.root, input.paths.approvalFile),
    plan: projectRelative(input.root, input.paths.plan),
    mcpConfig: projectRelative(input.root, input.paths.mcpConfig),
    sqlitePath: projectRelative(input.root, input.paths.sqlitePath),
    report: projectRelative(input.root, input.paths.report),
    partialReport: projectRelative(input.root, input.paths.partialReport),
    journal: projectRelative(input.root, input.paths.journal),
    monitoringEvidenceSha256: sha256(readFileSync(input.paths.monitoringEvidence)),
    interruptionProcedureSha256: sha256(readFileSync(input.paths.interruptionProcedure))
  };
  if (
    Object.keys(bindings).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => bindings[key] !== value)
  ) {
    throw new Error("Gate D preflight path or evidence binding mismatch");
  }
}

function executorFailureReport(generatedAt: string): RuntimeBaselineReport {
  return createRuntimeBaselineReport({
    track: "production",
    generatedAt,
    workload: buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 }),
    environment: {
      baselineKind: "fixed-24-hour-soak",
      evidenceKind: "formal-24-hour-soak",
      runComplete: false,
      restartScheduleMs: [2, 12, 22].map(hours => hours * 60 * 60 * 1000),
      observedRestartScheduleMs: []
    },
    samples: [{
      sampledAt: generatedAt,
      admissionP95Ms: 0,
      durableReplayP95Ms: 0,
      rssBytes: 0,
      openFileDescriptors: 0,
      walBytes: 0,
      mcpChildCount: 0,
      hardFailures: ["GATE_D_EXECUTOR_FAILURE"]
    }]
  });
}

function assertFormalGateDReport(value: RuntimeBaselineReport): void {
  const report = RuntimeBaselineReportSchema.parse(value);
  const fixedRestarts = [2, 12, 22].map(hours => hours * 60 * 60 * 1000);
  const operations = report.workload.operations;
  const environment = report.environment;
  const mix = report.workload.mix;
  if (
    report.track !== "production" || report.workload.seededConversations !== 10_000 ||
    report.workload.concurrency !== 20 || !operations || operations.length !== 10_000 ||
    mix.noTool !== 0.6 || mix.javaSandbox !== 0.2 || mix.mcp !== 0.15 || mix.approvalInterruption !== 0.05 ||
    environment.baselineKind !== "fixed-24-hour-soak" || environment.evidenceKind !== "formal-24-hour-soak" ||
    JSON.stringify(environment.restartScheduleMs) !== JSON.stringify(fixedRestarts)
  ) {
    throw new Error("Gate D formal report invariants are invalid");
  }
  if (
    report.result === "pass" && (
      report.samples.length !== 2_880 || environment.runComplete !== true ||
      JSON.stringify(environment.observedRestartScheduleMs) !== JSON.stringify(fixedRestarts)
    )
  ) {
    throw new Error("Gate D passing report is incomplete");
  }
  if (report.result !== "pass" && report.result !== "fail") {
    throw new Error("Gate D formal report result must be pass or fail");
  }
}

export async function probeGateDJavaFixtures(input: { javaUrl: string; serviceToken: string }): Promise<void> {
  const headers = {
    Authorization: `Bearer ${input.serviceToken}`,
    "X-Tenant-Id": "gate-d-preflight",
    "X-User-Id": "gate-d-preflight",
    "X-Trace-Id": "gate-d-preflight",
    "X-Request-Id": "gate-d-preflight"
  };
  const health = await fetch(`${input.javaUrl}/actuator/health`, { headers });
  if (!health.ok) throw new Error("Java Gateway health probe failed");
  const catalog = await fetch(`${input.javaUrl}/api/v1/tools/catalog`, { headers });
  if (!catalog.ok) throw new Error("Java Gateway catalog probe failed");
  const catalogBody: unknown = await catalog.json();
  if (!isRecord(catalogBody) || !nonBlank(catalogBody.catalogVersion) || !nonBlank(catalogBody.catalogHash)) {
    throw new Error("Java Gateway catalog probe returned invalid evidence");
  }
  for (const fixture of ["gate-d-no-tool", "tool-time", "mcp-qualification-echo"]) {
    const response = await fetch(`${input.javaUrl}/api/v1/model/chat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "X-Mock-Fixture": fixture },
      body: JSON.stringify({
        requestId: `gate-d-preflight-${fixture}`,
        conversationId: "gate-d-preflight",
        userId: "gate-d-preflight",
        tenantId: "gate-d-preflight",
        model: "default",
        stream: false,
        messages: [{ role: "user", content: "gate d preflight" }],
        tools: [],
        meta: { cacheEnabled: false }
      })
    });
    if (!response.ok) throw new Error("Java Gateway deterministic fixture probe failed");
    assertFixtureResponse(fixture, await response.json());
  }
  const sandbox = await fetch(`${input.javaUrl}/api/v1/tools/execute`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "gate-d-preflight-tool-time",
      conversationId: "gate-d-preflight",
      userId: "gate-d-preflight",
      tenantId: "gate-d-preflight",
      toolCallId: "gate-d-preflight-tool-time",
      toolName: "get_current_time",
      arguments: { timezone: "Asia/Shanghai" },
      catalogVersion: catalogBody.catalogVersion,
      catalogHash: catalogBody.catalogHash,
      idempotencyKey: "gate-d-preflight-tool-time"
    })
  });
  if (!sandbox.ok) throw new Error("Java Gateway sandbox execution probe failed");
  const sandboxBody: unknown = await sandbox.json();
  if (!isRecord(sandboxBody) || sandboxBody.status !== "ok") {
    throw new Error("Java Gateway sandbox execution probe returned invalid evidence");
  }
}

function assertFixtureResponse(fixture: string, value: unknown): void {
  if (!isRecord(value) || !isRecord(value.message)) {
    throw new Error("Java Gateway deterministic fixture probe returned invalid evidence");
  }
  if (value.rawProvider !== "mock") {
    throw new Error("Java Gateway deterministic fixture was not served by the mock provider");
  }
  const calls = Array.isArray(value.message.toolCalls) ? value.message.toolCalls : [];
  const callRecords = calls.filter(isRecord);
  const names = callRecords
    .map(call => call.name)
    .filter((name): name is string => typeof name === "string");
  const expected = fixture === "tool-time"
    ? "get_current_time"
    : fixture === "mcp-qualification-echo" ? "mcp_call" : undefined;
  if (expected === undefined ? names.length !== 0 : names.length !== 1 || names[0] !== expected) {
    throw new Error("Java Gateway deterministic fixture probe returned an unexpected tool shape");
  }
  if (fixture === "mcp-qualification-echo") {
    const argumentsRaw = callRecords[0]?.argumentsRaw;
    let envelope: unknown;
    try {
      envelope = typeof argumentsRaw === "string" ? JSON.parse(argumentsRaw) : null;
    } catch {
      envelope = null;
    }
    if (
      !isRecord(envelope)
      || envelope.server !== "qualification"
      || envelope.tool !== "qualification_echo"
      || !isRecord(envelope.arguments)
    ) {
      throw new Error("Java Gateway deterministic MCP broker fixture returned an unexpected target");
    }
  }
}

export async function probeGateDMcpFixture(path: string): Promise<void> {
  const registry = new McpRegistry(loadMcpConfigFile(path));
  await registry.init();
  try {
    await registry.getVirtualSkill("mcp:qualification");
    if (registry.getServerForTool("qualification_echo") === null) {
      throw new Error("MCP qualification fixture probe failed");
    }
  } finally {
    await registry.shutdown();
  }
}

function defaultDiskHeadroomBytes(path: string): GateDDiskHeadroom {
  const stats = statfsSync(path);
  const bytes = Number(stats.bavail) * Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  return { bytes, ratio: totalBytes > 0 ? bytes / totalBytes : 0 };
}

function normalizeDiskHeadroom(value: number | GateDDiskHeadroom): GateDDiskHeadroom {
  const observed = typeof value === "number" ? { bytes: value, ratio: 1 } : value;
  if (
    !Number.isSafeInteger(observed.bytes) || observed.bytes < 0 ||
    !Number.isFinite(observed.ratio) || observed.ratio < 0 || observed.ratio > 1
  ) {
    throw new Error("Gate D disk headroom probe returned invalid evidence");
  }
  return observed;
}

function canonicalInput(root: string, path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error(`Gate D ${label} path must be absolute`);
  const canonical = realpathSync(path);
  assertWithinRoot(root, canonical, label);
  return canonical;
}

function canonicalOutput(root: string, path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error(`Gate D ${label} path must be absolute`);
  const canonicalParent = realpathSync(dirname(path));
  assertWithinRoot(root, canonicalParent, label);
  const canonical = resolve(canonicalParent, basename(path));
  if (existsSync(canonical)) throw new Error(`Gate D ${label} already exists`);
  return canonical;
}

function assertWithinRoot(root: string, path: string, label: string): void {
  const suffix = relative(root, path);
  if (suffix === "" || (!suffix.startsWith(`..${sep}`) && suffix !== ".." && !isAbsolute(suffix))) return;
  throw new Error(`Gate D ${label} path escapes project root`);
}

function assertUniqueOutputs(paths: string[]): void {
  if (new Set(paths).size !== paths.length) throw new Error("Gate D output paths must be unique");
}

function projectRelative(root: string, path: string): string {
  const value = relative(root, path).split(sep).join("/");
  if (!value || value.startsWith("../") || value === "..") throw new Error("Gate D artifact path is invalid");
  return value;
}

function loopbackHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Gate D Java URL must be an absolute loopback HTTP URL");
  }
  if (parsed.protocol !== "http:" || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")) {
    throw new Error("Gate D Java URL must be an absolute loopback HTTP URL");
  }
  return parsed.origin;
}

function writeJsonNoOverwrite(path: string, value: unknown): void {
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") throw new Error("Gate D preflight output already exists");
    throw error;
  }
  try {
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function classifyError(error: unknown): string {
  if (isNodeError(error) && error.code === "ENOENT") return "path_not_found";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("already exists")) return "output_exists";
  if (message.includes("approval")) return "approval_invalid";
  if (message.includes("probe") || message.includes("headroom")) return "preflight_blocked";
  return "invalid_input";
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "preflight") {
    process.exitCode = await runGateDPreflightCli(args);
  } else if (command === "run") {
    process.exitCode = await runGateDRunCli(args);
  } else {
    process.stderr.write(`${JSON.stringify({ result: "blocked", errorClass: "unsupported_command" })}\n`);
    process.exitCode = 2;
  }
}
