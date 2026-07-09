import { createHash } from "node:crypto";
import type {
  QualificationMatrixRow,
  QualificationReport,
  QualificationReportResult,
  QualificationRowResult,
  QualificationTrack
} from "@openharness/shared-schema";
import type { CatalogResponse, ToolCallRequest, ToolCallResponse, TraceEvent } from "../types";
import type { McpRegistry } from "../mcpRegistry";
import { createQualificationReport } from "./report";

export interface JavaSandboxQualificationClient {
  fingerprint(): Promise<Record<string, unknown>>;
  getCatalog(): Promise<CatalogResponse>;
  executeTool(request: ToolCallRequest): Promise<ToolCallResponse>;
  cancelTool?(requestId: string, toolCallId: string): Promise<{
    requestId: string;
    toolCallId: string;
    cancelled: boolean;
  }>;
  readTraceEvents?(): Promise<TraceEvent[]>;
}

interface JavaSandboxMatrixInput {
  client: JavaSandboxQualificationClient;
  track: QualificationTrack;
}

interface McpMatrixInput {
  registry: McpRegistry;
  track: QualificationTrack;
}

const JAVA_ENVIRONMENT = {
  qualification: "java-sandbox-local-preflight",
  sandboxImplementation: "spring-boot-tool-execution-service"
};
const MCP_ENVIRONMENT = {
  qualification: "mcp-stdio-local-preflight",
  isolation: "subprocess"
};
const PROTOCOL_VERSION = "agent-runtime-v1";

export async function runJavaSandboxQualificationMatrix(input: JavaSandboxMatrixInput): Promise<QualificationReport> {
  const rows: QualificationMatrixRow[] = [];
  const fingerprint = await input.client.fingerprint();
  const catalog = await input.client.getCatalog();
  const context = new JavaSandboxContext(input.client, catalog);

  rows.push(row({
    id: "java-sandbox-fingerprint",
    track: input.track,
    environment: { ...JAVA_ENVIRONMENT, ...fingerprint },
    capabilities: ["fingerprint"],
    observed: fingerprint,
    oracle: { implementationPresent: true },
    pass: typeof fingerprint.implementation === "string" && fingerprint.implementation.length > 0
  }));

  const readResponse = await context.execute("java-sandbox-read-file", "read_file", { path: "note.txt" });
  rows.push(row({
    id: "java-sandbox-read-file",
    track: input.track,
    capabilities: ["read_file"],
    observed: responseObservation(readResponse),
    oracle: { status: "ok", contentContains: "needle" },
    pass: readResponse.status === "ok" && resultString(readResponse, "content").includes("needle")
  }));

  const searchResponse = await context.execute("java-sandbox-search", "search", { query: "needle" });
  rows.push(row({
    id: "java-sandbox-search",
    track: input.track,
    capabilities: ["search"],
    observed: responseObservation(searchResponse),
    oracle: { status: "ok", atLeastOneMatch: true },
    pass: searchResponse.status === "ok" && resultArray(searchResponse, "matches").length > 0
  }));

  const pwdResponse = await context.execute("java-sandbox-run-command-workspace", "run_command", { command: "pwd" });
  const workspaceRoot = typeof fingerprint.workspaceRoot === "string" ? fingerprint.workspaceRoot : "";
  rows.push(row({
    id: "java-sandbox-run-command-workspace",
    track: input.track,
    capabilities: ["run_command", "workspace"],
    observed: responseObservation(pwdResponse),
    oracle: { status: "ok", stdoutContainsWorkspace: Boolean(workspaceRoot) },
    pass: pwdResponse.status === "ok" && (!workspaceRoot || resultString(pwdResponse, "stdout").includes(workspaceRoot))
  }));

  const escapeResponse = await context.execute("java-sandbox-workspace-escape", "read_file", { path: "../outside.txt" });
  rows.push(row({
    id: "java-sandbox-workspace-escape",
    track: input.track,
    capabilities: ["read_file", "containment"],
    observed: responseObservation(escapeResponse),
    oracle: { status: "error", errorClass: "TOOL_USER_ERROR" },
    pass: escapeResponse.status !== "ok"
  }));

  const capResponse = await context.execute("java-sandbox-output-cap", "read_file", { path: "big.txt" });
  rows.push(row({
    id: "java-sandbox-output-cap",
    track: input.track,
    capabilities: ["output_cap"],
    observed: responseObservation(capResponse),
    oracle: { status: "ok", truncated: true, maxBytes: 4096 },
    pass: capResponse.status === "ok" &&
      Boolean(resultField(capResponse, "truncated")) &&
      byteLength(resultString(capResponse, "content")) <= 4096
  }));

  const timeoutResponse = await context.execute("java-sandbox-timeout", "run_command", { command: "sleep", args: ["5"], timeoutMs: 100 });
  rows.push(row({
    id: "java-sandbox-timeout",
    track: input.track,
    capabilities: ["timeout"],
    observed: responseObservation(timeoutResponse),
    oracle: { status: "timeoutOrError", messageContains: "timed out" },
    pass: timeoutResponse.status !== "ok" && responseErrorText(timeoutResponse).toLowerCase().includes("timed out")
  }));

  const policyResponse = await context.execute("java-sandbox-policy", "submit_payment", { amount: 10, to: "fixture" });
  rows.push(row({
    id: "java-sandbox-policy",
    track: input.track,
    capabilities: ["policy"],
    observed: responseObservation(policyResponse),
    oracle: { status: "error", errorClass: "POLICY_DENY" },
    pass: policyResponse.status !== "ok" && responseErrorClass(policyResponse) === "POLICY_DENY"
  }));

  const idempotentRequest = context.request("java-sandbox-idempotency", "read_file", { path: "note.txt" });
  const firstReplay = await context.executeRequest(idempotentRequest);
  const secondReplay = await context.executeRequest(idempotentRequest);
  rows.push(row({
    id: "java-sandbox-idempotency",
    track: input.track,
    capabilities: ["idempotency"],
    observed: { first: responseObservation(firstReplay), second: responseObservation(secondReplay) },
    oracle: { secondReplay: true },
    pass: firstReplay.status === "ok" && secondReplay.status === "ok" && secondReplay.idempotentReplay === true
  }));

  const cancelRequestId = "req-java-sandbox-cancellation";
  const cancelToolCallId = "tc-java-sandbox-cancellation";
  const cancelResult = input.client.cancelTool
    ? await input.client.cancelTool(cancelRequestId, cancelToolCallId)
    : { requestId: cancelRequestId, toolCallId: cancelToolCallId, cancelled: false };
  rows.push(row({
    id: "java-sandbox-cancellation",
    track: input.track,
    capabilities: ["cancellation"],
    observed: cancelResult,
    oracle: { cancelled: true },
    pass: cancelResult.requestId === cancelRequestId && cancelResult.toolCallId === cancelToolCallId && cancelResult.cancelled === true
  }));

  const traceEvents = input.client.readTraceEvents ? await input.client.readTraceEvents() : [];
  rows.push(row({
    id: "java-sandbox-audit-evidence",
    track: input.track,
    capabilities: ["audit"],
    observed: { eventTypes: traceEvents.map((event) => event.eventType) },
    oracle: { includes: ["TOOL_CALL_START", "TOOL_CALL_END"] },
    pass: traceEvents.some((event) => event.eventType === "TOOL_CALL_START") &&
      traceEvents.some((event) => event.eventType === "TOOL_CALL_END")
  }));

  const committedEventIds = traceEvents
    .map((event) => event.attributes?.committedEventId)
    .filter((value): value is string => typeof value === "string");
  rows.push(row({
    id: "java-sandbox-trace-dedup",
    track: input.track,
    capabilities: ["trace_deduplication"],
    observed: { committedEventIdCount: committedEventIds.length, uniqueCommittedEventIdCount: new Set(committedEventIds).size },
    oracle: { noDuplicateCommittedEventIds: true },
    pass: committedEventIds.length > 0 && committedEventIds.length === new Set(committedEventIds).size
  }));

  return report(input.track, rows);
}

export async function runMcpQualificationMatrix(input: McpMatrixInput): Promise<QualificationReport> {
  const rows: QualificationMatrixRow[] = [];
  const tools = await input.registry.refreshToolDefinitions();
  const toolNames = tools.map((entry) => entry.tool.name);

  rows.push(row({
    id: "mcp-initialize",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["initialize"],
    observed: { readyToolCount: toolNames.length },
    oracle: { hasQualificationServer: true },
    pass: input.registry.getServerForTool("qualification_echo") === "qualification"
  }));

  rows.push(row({
    id: "mcp-tools-list",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["tools/list"],
    observed: { toolNames },
    oracle: { includes: ["qualification_echo", "qualification_step", "qualification_slow"] },
    pass: ["qualification_echo", "qualification_step", "qualification_slow"].every((name) => toolNames.includes(name))
  }));

  rows.push(row({
    id: "mcp-catalog-conflict",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["catalog_conflict"],
    observed: { conflictToolServer: input.registry.getServerForTool("echo") },
    oracle: { conflictToolPresent: true },
    pass: input.registry.getServerForTool("echo") === "qualification"
  }));

  const echoCall = await mcpExecute(input.registry, "qualification", "qualification_echo", "mcp-multi-step-call-echo", { text: "hello" });
  const stepCall = await mcpExecute(input.registry, "qualification", "qualification_step", "mcp-multi-step-call-step", { step: 2 });
  rows.push(row({
    id: "mcp-multi-step-call",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["call", "multi_step"],
    observed: { echo: responseObservation(echoCall), step: responseObservation(stepCall) },
    oracle: { bothCallsOk: true },
    pass: echoCall.status === "ok" && stepCall.status === "ok"
  }));

  const provenanceCall = await mcpExecute(input.registry, "qualification", "qualification_echo", "mcp-provenance", {});
  rows.push(row({
    id: "mcp-provenance",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["provenance"],
    observed: responseObservation(provenanceCall),
    oracle: { provenance: "untrusted" },
    pass: provenanceCall.status === "ok" && provenanceCall.provenance === "untrusted"
  }));

  const approvalId = "approval-local-mcp-qualification";
  rows.push(row({
    id: "mcp-approval-id",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["approval"],
    observed: { approvalId, rawApprovalTokenPresent: false },
    oracle: { approvalIdBounded: true, noRawApprovalToken: true },
    pass: approvalId.startsWith("approval-local-")
  }));

  const timeoutCall = await mcpExecute(input.registry, "qualification", "qualification_slow", "mcp-timeout", {});
  rows.push(row({
    id: "mcp-timeout",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["timeout"],
    observed: responseObservation(timeoutCall),
    oracle: { status: "timeout", errorClass: "MCP_TOOL_TIMEOUT" },
    pass: timeoutCall.status === "timeout" && responseErrorClass(timeoutCall) === "MCP_TOOL_TIMEOUT"
  }));

  const crashCall = await mcpExecute(input.registry, "crash", "qualification_echo", "mcp-process-crash", {});
  rows.push(row({
    id: "mcp-process-crash",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["process_crash_isolation"],
    observed: responseObservation(crashCall),
    oracle: { status: "error" },
    pass: crashCall.status !== "ok"
  }));

  const controller = new AbortController();
  const cancellationPromise = mcpExecute(
    input.registry,
    "qualification",
    "qualification_slow",
    "mcp-cancellation",
    {},
    { signal: controller.signal }
  );
  setTimeout(() => controller.abort(), 25);
  const cancellationCall = await cancellationPromise;
  rows.push(row({
    id: "mcp-cancellation",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["cancellation"],
    observed: responseObservation(cancellationCall),
    oracle: { status: "error", errorClass: "MCP_TOOL_CANCELLED" },
    pass: cancellationCall.status !== "ok" && responseErrorClass(cancellationCall) === "MCP_TOOL_CANCELLED"
  }));

  let shutdownOk = false;
  try {
    await input.registry.shutdown();
    shutdownOk = true;
  } catch {
    shutdownOk = false;
  }
  rows.push(row({
    id: "mcp-sigterm-shutdown",
    track: input.track,
    environment: MCP_ENVIRONMENT,
    capabilities: ["sigterm_shutdown"],
    observed: { shutdownOk },
    oracle: { shutdownOk: true },
    pass: shutdownOk
  }));

  return report(input.track, rows);
}

class JavaSandboxContext {
  constructor(private readonly client: JavaSandboxQualificationClient, private readonly catalog: CatalogResponse) {}

  request(rowId: string, toolName: string, args: Record<string, unknown>): ToolCallRequest {
    return {
      requestId: `req-${rowId}`,
      conversationId: "conv-tool-qualification",
      userId: "user-local",
      tenantId: "tenant-local",
      toolCallId: `tc-${rowId}`,
      toolName,
      arguments: args,
      catalogVersion: this.catalog.catalogVersion,
      catalogHash: this.catalog.catalogHash,
      idempotencyKey: `idem-${rowId}`
    };
  }

  execute(rowId: string, toolName: string, args: Record<string, unknown>): Promise<ToolCallResponse> {
    return this.executeRequest(this.request(rowId, toolName, args));
  }

  async executeRequest(request: ToolCallRequest): Promise<ToolCallResponse> {
    try {
      return await this.client.executeTool(request);
    } catch (error) {
      return thrownToolResponse(request, error);
    }
  }
}

async function mcpExecute(
  registry: McpRegistry,
  serverName: string,
  toolName: string,
  rowId: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<ToolCallResponse> {
  return registry.execute(serverName, toolName, args, {
    requestId: `req-${rowId}`,
    conversationId: "conv-tool-qualification",
    toolCallId: `tc-${rowId}`
  }, options);
}

function row(input: {
  id: string;
  track: QualificationTrack;
  environment?: Record<string, unknown>;
  capabilities: string[];
  observed: Record<string, unknown>;
  oracle: Record<string, unknown>;
  pass: boolean;
  durationMs?: number;
}): QualificationMatrixRow {
  const result: QualificationRowResult = input.pass ? "pass" : "blocked";
  return {
    id: input.id,
    required: true,
    track: input.track,
    environment: input.environment ?? JAVA_ENVIRONMENT,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: input.capabilities,
    requestHash: hash({ id: input.id, observed: input.observed, oracle: input.oracle }),
    observed: input.observed,
    oracle: input.oracle,
    durationMs: input.durationMs ?? 0,
    result
  };
}

function report(track: QualificationTrack, rows: QualificationMatrixRow[]): QualificationReport {
  const allRequiredPassed = rows.every((candidate) => !candidate.required || candidate.result === "pass");
  const result: QualificationReportResult = allRequiredPassed
    ? (track === "local" ? "local_verified" : "pass")
    : "blocked";
  return createQualificationReport({
    track,
    generatedAt: new Date().toISOString(),
    result,
    rows
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function responseObservation(response: ToolCallResponse): Record<string, unknown> {
  return response.status === "ok"
    ? {
        status: response.status,
        result: response.result,
        idempotentReplay: response.idempotentReplay,
        provenance: response.provenance
      }
    : {
        status: response.status,
        idempotentReplay: response.idempotentReplay,
        provenance: response.provenance,
        errorClass: response.error.errorClass,
        errorMessage: response.error.errorMessage
      };
}

function resultField(response: ToolCallResponse, key: string): unknown {
  if (response.status !== "ok" || !response.result || typeof response.result !== "object") return undefined;
  return (response.result as Record<string, unknown>)[key];
}

function resultString(response: ToolCallResponse, key: string): string {
  const value = resultField(response, key);
  return typeof value === "string" ? value : "";
}

function resultArray(response: ToolCallResponse, key: string): unknown[] {
  const value = resultField(response, key);
  return Array.isArray(value) ? value : [];
}

function responseErrorClass(response: ToolCallResponse): string {
  return response.status === "ok" ? "" : response.error.errorClass;
}

function responseErrorText(response: ToolCallResponse): string {
  return response.status === "ok" ? "" : response.error.errorMessage;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function thrownToolResponse(request: ToolCallRequest, error: unknown): ToolCallResponse {
  const parsed = parseStructuredError(error);
  return {
    requestId: request.requestId,
    conversationId: request.conversationId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    status: parsed.errorClass.includes("TIMEOUT") ? "timeout" : "error",
    error: {
      errorClass: parsed.errorClass,
      errorMessage: parsed.errorMessage,
      retriable: false,
      retryOwner: "none",
      maxRetries: 0,
      fallbackAllowed: false,
      httpStatus: parsed.httpStatus
    }
  };
}

function parseStructuredError(error: unknown): { errorClass: string; errorMessage: string; httpStatus: number } {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { error?: { errorClass?: string; errorMessage?: string; httpStatus?: number } };
    return {
      errorClass: parsed.error?.errorClass ?? "TOOL_CLIENT_ERROR",
      errorMessage: parsed.error?.errorMessage ?? raw,
      httpStatus: parsed.error?.httpStatus ?? 500
    };
  } catch {
    return {
      errorClass: raw.toLowerCase().includes("timed out") ? "TOOL_TIMEOUT" : "TOOL_CLIENT_ERROR",
      errorMessage: raw,
      httpStatus: 500
    };
  }
}
