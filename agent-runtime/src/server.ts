import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  MemoryDeleteResponseSchema,
  MemoryListResponseSchema,
  MemorySearchQuerySchema,
  MemoryUpsertRequestSchema
} from "@openharness/shared-schema";
import { AgentStreamLoop } from "./agentStreamLoop";
import { AgentExecutionRunner } from "./agentExecutionRunner";
import { loadAgentDefinitions, type AgentDefinitionRegistry } from "./agentDefinitionLoader";
import { AskUserStore, type AskUserReply } from "./askUserStore";
import {
  JsonFileApprovalStore,
  type ApprovalDecision,
  type ApprovalStore
} from "./approvalStore";
import { createHistoryStore } from "./historyFactory";
import { toApi, type HistoryStore } from "./history";
import { HttpJavaClient, type JavaClient } from "./javaClient";
import { JsonFileMemoryStore, type MemoryStore } from "./memoryStore";
import { McpRegistry, loadMcpConfig } from "./mcpRegistry";
import { InMemoryRuntimeEventStore, type RuntimeEventStore } from "./runtimeEventStore";
import { InMemoryExecutionStateStore, type ExecutionStateStore } from "./executionStateStore";
import { deriveRuntimeProgress } from "./runtimeProgress";
import type { AgentChatRequest, AgentChatResponse, StopReason } from "./types";

export interface CreateServerOptions {
  javaClient?: JavaClient;
  serviceToken?: string;
  frontendUrl?: string;
  javaBaseUrl?: string;
  mcpRegistry?: McpRegistry;
  /** Skip MCP init even if mcp.json exists. Useful for tests. */
  disableMcp?: boolean;
  /** Optional runtime event store (Phase 1: defaults to InMemoryRuntimeEventStore). */
  runtimeEventStore?: RuntimeEventStore;
  /** Optional execution state store (Phase 2: defaults to InMemoryExecutionStateStore). */
  executionStateStore?: ExecutionStateStore;
  /** Optional approval store (Phase 3: defaults to JsonFileApprovalStore). */
  approvalStore?: ApprovalStore;
  /** Optional history store, primarily for API tests and controlled runtime wiring. */
  historyStore?: HistoryStore;
  /** Optional memory store for memory management routes and memory retrieval. */
  memoryStore?: MemoryStore;
  /** Optional preloaded agent definition registry for tests and future embedding. */
  agentDefinitionRegistry?: AgentDefinitionRegistry;
  /** Optional local agent definitions directory. Defaults to process cwd / agents. */
  agentDefinitionsDir?: string;
}

export async function createServer(options: CreateServerOptions = {}) {
  const app = Fastify({ logger: false });
  const frontendUrl = options.frontendUrl ?? process.env.FRONTEND_URL ?? "http://localhost:5173";
  await app.register(cors, {
    origin: frontendUrl,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Trace-Id",
      "X-Request-Id",
      "X-User-Id",
      "X-Tenant-Id",
      "X-Mock-Fixture"
    ],
    exposedHeaders: ["X-Trace-Id", "X-Request-Id"]
  });

  const javaClient = options.javaClient ?? new HttpJavaClient(options.javaBaseUrl ?? process.env.JAVA_BACKEND_URL ?? "http://localhost:8080");
  const serviceToken = options.serviceToken ?? process.env.OPENHARNESS_SERVICE_TOKEN ?? "dev-service-token";
  const history = options.historyStore ?? createHistoryStore();
  const memoryStore = options.memoryStore ?? new JsonFileMemoryStore();
  const askUserStore = new AskUserStore();
  const agentDefinitionRegistry = options.agentDefinitionRegistry ?? loadAgentDefinitions(options.agentDefinitionsDir);
  app.decorate("agentDefinitionRegistry", agentDefinitionRegistry);

  // Initialize MCP registry if not disabled
  let mcpRegistry: McpRegistry | undefined = options.mcpRegistry;
  if (!mcpRegistry && !options.disableMcp && !options.javaClient) {
    const config = loadMcpConfig();
    if (config) {
      mcpRegistry = new McpRegistry(config);
      await mcpRegistry.init();
    }
  }

  const runtimeEventStore: RuntimeEventStore = options.runtimeEventStore ?? new InMemoryRuntimeEventStore();
  const executionStateStore: ExecutionStateStore = options.executionStateStore ?? new InMemoryExecutionStateStore();
  const approvalStore: ApprovalStore = options.approvalStore ?? new JsonFileApprovalStore();
  const runner = new AgentExecutionRunner(javaClient, history, mcpRegistry, runtimeEventStore, executionStateStore, approvalStore, memoryStore);
  const streamLoop = new AgentStreamLoop(runner, runtimeEventStore);

  const activeConflict = (tenantId: string, conversationId: string) => {
    const active = executionStateStore.getActive(tenantId, conversationId);
    if (!active) return null;
    const errorClass = active.status === "waiting_approval"
      ? "EXECUTION_WAITING_APPROVAL"
      : "EXECUTION_ALREADY_RUNNING";
    return {
      statusCode: 409,
      body: {
        error: {
          errorClass,
          errorMessage: `Execution already active for conversation: ${conversationId}`
        },
        executionId: active.executionId,
        status: active.status,
        pendingApprovals: active.status === "waiting_approval"
          ? approvalStore.listPending(tenantId, conversationId)
          : []
      }
    };
  };

  const selectAgentDefinition = (agentId?: string) => {
    const selectedAgentId = agentId ?? "default-agent";
    const definition = agentDefinitionRegistry.get(selectedAgentId);
    if (!definition) {
      return {
        error: {
          errorClass: "AGENT_DEFINITION_NOT_FOUND",
          errorMessage: `Unknown agentId: ${selectedAgentId}`
        }
      };
    }
    return { definition };
  };

  // Cleanup MCP child processes on Fastify close
  if (mcpRegistry) {
    app.addHook("onClose", async () => {
      await mcpRegistry!.shutdown();
    });
  }

  app.post<{ Body: AgentChatRequest }>("/api/v1/agent/chat", async (request, reply) => {
    const body = request.body;
    const userId = header(request.headers["x-user-id"]) ?? "user-001";
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const traceId = header(request.headers["x-trace-id"]) ?? crypto.randomUUID();
    const requestId = header(request.headers["x-request-id"]) ?? crypto.randomUUID();
    const headers = {
      Authorization: `Bearer ${serviceToken}`,
      "X-User-Id": userId,
      "X-Tenant-Id": tenantId,
      "X-Trace-Id": traceId,
      "X-Request-Id": requestId
    };
    const mockFixture = header(request.headers["x-mock-fixture"]);
    const javaHeaders = mockFixture ? { ...headers, "X-Mock-Fixture": mockFixture } : headers;

    const selectedAgent = selectAgentDefinition(body.agentId);
    if ("error" in selectedAgent) {
      reply.status(400).send({ error: selectedAgent.error });
      return;
    }

    const conflict = activeConflict(tenantId, body.conversationId);
    if (conflict) {
      reply.status(conflict.statusCode).send(conflict.body);
      return;
    }

    const handle = runner.start({
      conversationId: body.conversationId,
      message: body.message,
      userId,
      tenantId,
      traceId,
      requestId,
      headers: javaHeaders,
      agentDefinition: selectedAgent.definition,
      stepBudget: body.stepBudget
    });
    const finalState = await handle.done;
    const response = buildSyncResponse(
      tenantId,
      body.conversationId,
      handle.executionId,
      traceId,
      requestId,
      finalState.endReason as StopReason | undefined,
      runtimeEventStore
    );
    reply.header("X-Trace-Id", traceId).header("X-Request-Id", requestId).send(response);
  });

  app.post<{ Body: AgentChatRequest }>("/api/v1/agent/chat/stream", async (request, reply) => {
    const body = request.body;
    const userId = header(request.headers["x-user-id"]) ?? "user-001";
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const traceId = header(request.headers["x-trace-id"]) ?? crypto.randomUUID();
    const requestId = header(request.headers["x-request-id"]) ?? crypto.randomUUID();
    const headers = {
      Authorization: `Bearer ${serviceToken}`,
      "X-User-Id": userId,
      "X-Tenant-Id": tenantId,
      "X-Trace-Id": traceId,
      "X-Request-Id": requestId
    };
    const mockFixture = header(request.headers["x-mock-fixture"]);
    const javaHeaders = mockFixture ? { ...headers, "X-Mock-Fixture": mockFixture } : headers;

    const selectedAgent = selectAgentDefinition(body.agentId);
    if ("error" in selectedAgent) {
      reply.status(400).send({ error: selectedAgent.error });
      return;
    }

    const conflict = activeConflict(tenantId, body.conversationId);
    if (conflict) {
      reply.status(conflict.statusCode).send(conflict.body);
      return;
    }

    reply.header("X-Trace-Id", traceId).header("X-Request-Id", requestId);
    await streamLoop.stream({
      conversationId: body.conversationId,
      message: body.message,
      userId,
      tenantId,
      traceId,
      requestId,
      headers: javaHeaders,
      agentDefinition: selectedAgent.definition,
      stepBudget: body.stepBudget
    }, reply);
  });

  app.post<{ Params: { askUserId: string }; Body: AskUserReply }>("/api/v1/agent/ask-user/:askUserId/reply", async (request, reply) => {
    const { askUserId } = request.params;
    const approvalPending = approvalStore.getByAskUserId(askUserId);
    if (approvalPending) {
      const body = request.body;
      const decision = toApprovalDecision(body);
      approvalStore.decide(approvalPending.executionId, approvalPending.toolCallId, decision);
      reply.send({
        askUserId,
        executionId: approvalPending.executionId,
        toolCallId: approvalPending.toolCallId,
        status: approvalStatus(decision.action)
      });
      return;
    }

    const pending = askUserStore.getById(askUserId);
    if (!pending) {
      reply.status(404).send({ error: { errorClass: "ASK_USER_NOT_FOUND", errorMessage: "No pending ask_user with id: " + askUserId } });
      return;
    }
    const body = request.body;
    askUserStore.remove(askUserId);

    if (body.action === "reject") {
      history.append(pending.tenantId, pending.conversationId, {
        role: "tool",
        toolCallId: pending.pendingToolCall.id,
        content: "USER_REJECTED"
      });
      reply.send({ askUserId, status: "rejected" });
      return;
    }

    // approve or revise: execute the tool
    const toolCall = body.action === "revise" && body.revisedArguments
      ? { ...pending.pendingToolCall, argumentsRaw: JSON.stringify(body.revisedArguments) }
      : pending.pendingToolCall;

    const execHeaders = {
      Authorization: `Bearer ${serviceToken}`,
      "X-User-Id": pending.userId,
      "X-Tenant-Id": pending.tenantId,
      "X-Trace-Id": pending.requestId,
      "X-Request-Id": pending.requestId
    };

    const result = await javaClient.executeTool({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      userId: pending.userId,
      tenantId: pending.tenantId,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: JSON.parse(toolCall.argumentsRaw),
      catalogVersion: "latest",
      catalogHash: "latest",
      idempotencyKey: `${pending.requestId}:${toolCall.id}`,
      approvalToken: pending.approvalToken
    }, execHeaders);

    const content = result.status === "ok" ? JSON.stringify(result.result ?? {}) : JSON.stringify(result.error);
    history.append(pending.tenantId, pending.conversationId, {
      role: "tool", toolCallId: toolCall.id, content
    });
    reply.send({ askUserId, status: "approved", toolResult: result });
  });

  // ── Memory Management API ──────────────────────────────────────────────────

  app.get<{
    Querystring: { query?: string; tags?: string | string[] };
  }>("/api/v1/memory/facts", async (request, reply) => {
    try {
      const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
      const userId = header(request.headers["x-user-id"]) ?? "user-001";
      const tags = parseTags(request.query.tags);
      const query = request.query.query ?? "";
      const parsed = MemorySearchQuerySchema.parse({ query, tags });
      const facts = parsed.query.length > 0 || parsed.tags.length > 0
        ? await memoryStore.search(tenantId, userId, parsed.query, parsed.tags)
        : await memoryStore.list(tenantId, userId);
      reply.send(MemoryListResponseSchema.parse({ facts }));
    } catch {
      reply.status(400).send({ error: { errorClass: "INVALID_MEMORY_REQUEST", errorMessage: "Invalid memory request" } });
    }
  });

  app.put("/api/v1/memory/facts", async (request, reply) => {
    try {
      const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
      const userId = header(request.headers["x-user-id"]) ?? "user-001";
      const parsed = MemoryUpsertRequestSchema.parse(request.body);
      const fact = await memoryStore.upsert({
        memoryId: parsed.memoryId,
        tenantId,
        userId,
        agentId: parsed.agentId,
        content: parsed.content,
        tags: parsed.tags
      });
      reply.send(fact);
    } catch {
      reply.status(400).send({ error: { errorClass: "INVALID_MEMORY_REQUEST", errorMessage: "Invalid memory request" } });
    }
  });

  app.delete<{ Params: { memoryId: string } }>("/api/v1/memory/facts/:memoryId", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const userId = header(request.headers["x-user-id"]) ?? "user-001";
    const { memoryId } = request.params;
    const deleted = await memoryStore.delete(tenantId, userId, memoryId);
    const body = MemoryDeleteResponseSchema.parse({ memoryId, deleted });
    if (!deleted) {
      reply.status(404).send(body);
      return;
    }
    reply.send(body);
  });

  // ── Sessions API ───────────────────────────────────────────────────────────

  app.get<{
    Params: { conversationId: string };
    Querystring: { last_event_id?: string };
  }>("/api/v1/sessions/:conversationId/events", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const { conversationId } = request.params;
    const lastEventId = request.query.last_event_id ?? null;

    const origin = request.headers.origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin
    });

    const writeEvent = (kind: string, data: Record<string, unknown>) => {
      reply.raw.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;
    const close = () => {
      if (closed) return;
      closed = true;
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
      reply.raw.end();
    };

    // Gap detection: cursor unknown but store has events for this conversation.
    if (lastEventId && !runtimeEventStore.hasEvent(tenantId, conversationId, lastEventId)) {
      const latest = runtimeEventStore.latestEventId(tenantId, conversationId);
      if (latest != null) {
        writeEvent("stream_resync_required", {
          eventId: `${tenantId}::${conversationId}:resync`,
          executionId: "resync",
          conversationId,
          tenantId,
          traceId: header(request.headers["x-trace-id"]) ?? "",
          requestId: header(request.headers["x-request-id"]) ?? "",
          createdAt: Date.now(),
          lastAvailableEventId: latest,
          requestedLastEventId: lastEventId
        });
        close();
        return;
      }
    }

    // Helper to emit a stored SessionEvent (preserving its eventId / fields).
    const emitStored = (e: { eventId: string; executionId: string; conversationId: string; tenantId: string; traceId: string; requestId: string; createdAt: number; kind: string; data: Record<string, unknown> }) => {
      writeEvent(e.kind, {
        ...e.data,
        eventId: e.eventId,
        executionId: e.executionId,
        conversationId: e.conversationId,
        tenantId: e.tenantId,
        traceId: e.traceId,
        requestId: e.requestId,
        createdAt: e.createdAt
      });
    };

    const isTerminal = (kind: string) => kind === "stream_done" || kind === "stream_error" || kind === "stream_resync_required";

    // Subscribe BEFORE replay to avoid losing fast-arriving live events; JS single-thread
    // guarantees no append can interleave between since() and subscribe() in this same tick.
    unsubscribe = runtimeEventStore.subscribe(tenantId, conversationId, (event) => {
      if (closed) return;
      emitStored(event);
      if (isTerminal(event.kind)) close();
    });

    const replayed = runtimeEventStore.since(tenantId, conversationId, lastEventId);
    for (const e of replayed) {
      if (closed) break;
      emitStored(e);
      if (isTerminal(e.kind)) {
        close();
        return;
      }
    }

    // Heartbeat to keep proxies from closing the connection during idle periods.
    heartbeat = setInterval(() => {
      if (closed) return;
      reply.raw.write(`: heartbeat\n\n`);
    }, 30000);

    // Cleanup on client disconnect.
    request.raw.on("close", close);
  });

  app.get("/api/v1/sessions", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const sessions = await history.list(tenantId);
    reply.send(sessions);
  });

  app.get<{ Params: { conversationId: string } }>("/api/v1/sessions/:conversationId", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const { conversationId } = request.params;
    const messages = history.get(tenantId, conversationId);
    const active = executionStateStore.getActive(tenantId, conversationId);
    const pendingApprovals = approvalStore.listPending(tenantId, conversationId);
    const runtimeProgress = progressForSession(runtimeEventStore, executionStateStore, tenantId, conversationId, active?.executionId);
    if (messages.length === 0 && !active && pendingApprovals.length === 0) {
      reply.status(404).send({
        error: { errorClass: "SESSION_NOT_FOUND", errorMessage: `Session not found: ${conversationId}` }
      });
      return;
    }
    reply.send({
      conversationId,
      messages: toApi(messages),
      activeExecution: active
        ? {
            executionId: active.executionId,
            conversationId: active.conversationId,
            tenantId: active.tenantId,
            status: active.status,
            startedAt: active.startedAt,
            updatedAt: active.updatedAt,
            endedAt: active.endedAt,
            endReason: active.endReason
          }
        : null,
      ...(runtimeProgress ? { runtimeProgress } : {}),
      pendingApprovals
    });
  });

  app.post<{
    Params: { conversationId: string; executionId: string; toolCallId: string };
    Body: Partial<ApprovalDecision>;
  }>("/api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId", async (request, reply) => {
    const { conversationId, executionId, toolCallId } = request.params;
    const pending = approvalStore.get(executionId, toolCallId);
    if (!pending || pending.conversationId !== conversationId) {
      reply.status(404).send({
        error: {
          errorClass: "APPROVAL_NOT_FOUND",
          errorMessage: `Approval not found: ${executionId}/${toolCallId}`
        }
      });
      return;
    }
    const decision = toApprovalDecision(request.body);
    approvalStore.decide(executionId, toolCallId, decision);
    reply.send({
      executionId,
      toolCallId,
      status: approvalStatus(decision.action)
    });
  });

  app.delete<{ Params: { conversationId: string } }>("/api/v1/sessions/:conversationId", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const { conversationId } = request.params;
    await history.delete(tenantId, conversationId);
    reply.status(204).send();
  });

  // ── Abort Execution API ────────────────────────────────────────────────────

  app.post<{
    Params: { conversationId: string; executionId: string };
  }>("/api/v1/sessions/:conversationId/executions/:executionId/abort", async (request, reply) => {
    const { executionId } = request.params;
    const state = executionStateStore.get(executionId);
    if (!state) {
      reply.status(404).send({
        error: { errorClass: "EXECUTION_NOT_FOUND", errorMessage: `Execution not found: ${executionId}` }
      });
      return;
    }
    // No-op if already terminal.
    executionStateStore.abort(executionId);
    const after = executionStateStore.get(executionId)!;
    reply.send({ executionId: after.executionId, status: after.status });
  });

  // Expose askUserStore for stream loop to create pendings
  (app as unknown as { askUserStore: AskUserStore }).askUserStore = askUserStore;

  return app;
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTags(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toApprovalDecision(body: Partial<ApprovalDecision> | AskUserReply): ApprovalDecision {
  const action = body.action === "reject" || body.action === "revise" ? body.action : "approve";
  return {
    action,
    revisedArguments: body.revisedArguments,
    message: body.message,
    respondedAt: body.respondedAt ?? new Date().toISOString()
  };
}

function approvalStatus(action: ApprovalDecision["action"]): "approved" | "rejected" | "revised" {
  if (action === "reject") return "rejected";
  if (action === "revise") return "revised";
  return "approved";
}

function buildSyncResponse(
  tenantId: string,
  conversationId: string,
  executionId: string,
  traceId: string,
  requestId: string,
  stopReason: StopReason | undefined,
  runtimeEventStore: RuntimeEventStore
): AgentChatResponse {
  const events = runtimeEventStore
    .since(tenantId, conversationId, null)
    .filter((event) => event.executionId === executionId);
  const finalAnswer = [...events].reverse().find((event) => event.kind === "final_answer");
  const usage = isUsage(finalAnswer?.data.usage) ? finalAnswer.data.usage : undefined;
  return {
    conversationId,
    answer: typeof finalAnswer?.data.answer === "string" ? finalAnswer.data.answer : "",
    ...(usage ? { usage } : {}),
    traceId,
    requestId,
    trace: { events: events.map((event) => event.kind) },
    stopReason
  };
}

function isUsage(value: unknown): value is { costUsdMicros?: number } {
  if (value == null || typeof value !== "object") return false;
  const cost = (value as { costUsdMicros?: unknown }).costUsdMicros;
  return cost === undefined || typeof cost === "number";
}

function progressForSession(
  runtimeEventStore: RuntimeEventStore,
  executionStateStore: ExecutionStateStore,
  tenantId: string,
  conversationId: string,
  activeExecutionId?: string
) {
  const allEvents = runtimeEventStore.since(tenantId, conversationId, null);
  const executionId = activeExecutionId ?? allEvents[allEvents.length - 1]?.executionId;
  if (!executionId) return null;
  const events = allEvents.filter((event) => event.executionId === executionId);
  return deriveRuntimeProgress({
    events,
    state: executionStateStore.get(executionId)
  });
}
