import cors from "@fastify/cors";
import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import {
  MemoryDeleteResponseSchema,
  MemoryListResponseSchema,
  MemorySearchQuerySchema,
  MemoryUpsertRequestSchema,
  type SessionEvent
} from "@openharness/shared-schema";
import { AgentStreamLoop } from "./agentStreamLoop";
import { AgentExecutionRunner } from "./agentExecutionRunner";
import { loadAgentDefinitions, type AgentDefinitionRegistry } from "./agentDefinitionLoader";
import { AskUserStore, type AskUserReply } from "./askUserStore";
import {
  ProcessApprovalStore,
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
import { InMemoryExecutionStateStore, ProcessExecutionStateStore, type ExecutionStateStore } from "./executionStateStore";
import { openProductionRuntimeContext, type ProductionRuntimeContext } from "./storage/productionRuntimeContext";
import type { RuntimeDatabaseIdentity } from "./storage/runtimeStorage";
import { publishCommittedLifecycleEvents } from "./storage/lifecycleCommands";
import { deriveRuntimeProgress } from "./runtimeProgress";
import type { AgentChatRequest, AgentChatResponse, StopReason } from "./types";

export interface CreateServerOptions {
  javaClient?: JavaClient;
  serviceToken?: string;
  requireServiceAuth?: boolean;
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
  /** Owned production storage/lifecycle context. Mutually exclusive with individual store injection. */
  runtimeContext?: ProductionRuntimeContext;
  /** Injectable development-only fallbacks; production context must bypass every factory. */
  developmentStoreFactories?: DevelopmentStoreFactories;
}

export interface DevelopmentStoreFactories {
  history(): HistoryStore;
  memory(): MemoryStore;
  events(): RuntimeEventStore;
  executions(): ExecutionStateStore;
  approvals(): ApprovalStore;
}

export interface CreateProductionServerOptions {
  databasePath: string;
  expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
  serviceToken: string;
  javaClient?: JavaClient;
  javaBaseUrl?: string;
  frontendUrl?: string;
  mcpRegistry?: McpRegistry;
  disableMcp?: boolean;
}

export async function createServer(options: CreateServerOptions = {}) {
  if (options.runtimeContext && (
    options.historyStore || options.memoryStore || options.runtimeEventStore
    || options.executionStateStore || options.approvalStore
  )) {
    throw new Error("Production Runtime context cannot be combined with individually injected stores");
  }
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
  const requireServiceAuth = options.requireServiceAuth ?? process.env.AGENT_RUNTIME_REQUIRE_SERVICE_AUTH === "true";
  const developmentStores = options.developmentStoreFactories ?? defaultDevelopmentStoreFactories;
  const history = options.runtimeContext?.history ?? options.historyStore ?? developmentStores.history();
  const memoryStore = options.runtimeContext?.memory ?? options.memoryStore ?? developmentStores.memory();
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

  const runtimeEventStore: RuntimeEventStore = options.runtimeContext
    ? productionRuntimeEventStore(options.runtimeContext)
    : options.runtimeEventStore ?? developmentStores.events();
  const executionStateStore: ExecutionStateStore = options.runtimeContext
    ? new ProcessExecutionStateStore()
    : options.executionStateStore ?? developmentStores.executions();
  const executionReader = options.runtimeContext?.executions ?? executionStateStore;
  const approvalStore: ApprovalStore = options.runtimeContext
    ? new ProcessApprovalStore()
    : options.approvalStore ?? developmentStores.approvals();
  const approvalReader = options.runtimeContext?.approvals ?? approvalStore;
  const runner = new AgentExecutionRunner(
    javaClient,
    history,
    mcpRegistry,
    runtimeEventStore,
    executionStateStore,
    approvalStore,
    memoryStore,
    options.runtimeContext ? { lifecycle: options.runtimeContext.lifecycle, liveEvents: options.runtimeContext.liveEvents } : undefined
  );
  const streamLoop = new AgentStreamLoop(runner, runtimeEventStore);

  app.addHook("preHandler", async (request, reply) => {
    if (!header(request.headers["x-user-id"])?.trim()) {
      reply.status(400).send({
        error: {
          errorClass: "MISSING_IDENTITY_HEADER",
          errorMessage: "Missing required identity header: x-user-id"
        }
      });
      return;
    }
    if (!requireServiceAuth) return;
    if (!validBearer(header(request.headers.authorization), serviceToken)) {
      reply.status(401).send({ error: { errorClass: "UNAUTHORIZED", errorMessage: "Missing or invalid service credential" } });
      return;
    }
    const missing = requiredIdentityHeaders(request.headers);
    if (missing.length > 0) {
      reply.status(400).send({
        error: {
          errorClass: "MISSING_IDENTITY_HEADER",
          errorMessage: `Missing required identity header: ${missing.join(",")}`
        }
      });
      return;
    }
  });

  const activeConflict = (tenantId: string, userId: string, conversationId: string) => {
    const active = executionReader.getActive(tenantId, userId, conversationId);
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
          ? sanitizePendingApprovals(approvalReader.listPending(tenantId, userId, conversationId))
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
    const { tenantId, userId, traceId, requestId } = requestIdentity(request.headers);
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

    const conflict = activeConflict(tenantId, userId, body.conversationId);
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
      userId,
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
    const { tenantId, userId, traceId, requestId } = requestIdentity(request.headers);
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

    const conflict = activeConflict(tenantId, userId, body.conversationId);
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
    const pending = askUserStore.getById(askUserId);
    if (!pending) {
      reply.status(404).send({ error: { errorClass: "ASK_USER_NOT_FOUND", errorMessage: "No pending ask_user with id: " + askUserId } });
      return;
    }
    const body = request.body;
    askUserStore.remove(askUserId);

    if (body.action === "reject") {
      history.append(pending.tenantId, pending.userId, pending.conversationId, {
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
    history.append(pending.tenantId, pending.userId, pending.conversationId, {
      role: "tool", toolCallId: toolCall.id, content
    });
    reply.send({ askUserId, status: "approved", toolResult: result });
  });

  // ── Memory Management API ──────────────────────────────────────────────────

  app.get<{
    Querystring: { query?: string; tags?: string | string[] };
  }>("/api/v1/memory/facts", async (request, reply) => {
    try {
      const { tenantId, userId } = requestIdentity(request.headers);
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
      const { tenantId, userId } = requestIdentity(request.headers);
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
    const { tenantId, userId, traceId, requestId } = requestIdentity(request.headers);
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
    const { tenantId, userId, traceId, requestId } = requestIdentity(request.headers);
    const { conversationId } = request.params;
    const lastEventId = request.query.last_event_id ?? null;

    const scopedEvents = runtimeEventStore.since(tenantId, userId, conversationId, null);
    if (lastEventId && scopedEvents.length === 0) {
      reply.status(404).send({
        error: { errorClass: "SESSION_EVENTS_NOT_FOUND", errorMessage: "Session events not found" }
      });
      return;
    }

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
    if (lastEventId && !scopedEvents.some((event) => event.eventId === lastEventId)) {
      const latest = latestScopedEventId(runtimeEventStore, tenantId, userId, conversationId);
      if (latest != null) {
        writeEvent("stream_resync_required", {
          durability: "durable",
          eventId: `${tenantId}::${userId}::${conversationId}:resync`,
          executionId: "resync",
          conversationId,
          tenantId,
          userId,
          traceId,
          requestId,
          createdAt: Date.now(),
          data: {
            lastAvailableEventId: latest,
            requestedLastEventId: lastEventId
          }
        });
        close();
        return;
      }
    }

    // Helper to emit a stored SessionEvent (preserving its eventId / fields).
    const emitStored = (e: SessionEvent) => {
      writeEvent(e.kind, {
        durability: e.durability,
        eventId: e.eventId,
        executionId: e.executionId,
        conversationId: e.conversationId,
        tenantId: e.tenantId,
        userId: e.userId,
        traceId: e.traceId,
        requestId: e.requestId,
        createdAt: e.createdAt,
        data: e.data
      });
    };

    const isTerminal = (kind: string) => kind === "stream_done" || kind === "stream_error" || kind === "stream_resync_required";

    // Subscribe BEFORE replay to avoid losing fast-arriving live events; JS single-thread
    // guarantees no append can interleave between since() and subscribe() in this same tick.
    unsubscribe = runtimeEventStore.subscribe(tenantId, userId, conversationId, (event) => {
      if (closed) return;
      emitStored(event);
      if (isTerminal(event.kind)) close();
    });

    const replayed = eventsAfter(scopedEvents, lastEventId);
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
    const { tenantId, userId } = requestIdentity(request.headers);
    const sessions = await history.list(tenantId, userId);
    reply.send(sessions);
  });

  app.get<{ Params: { conversationId: string } }>("/api/v1/sessions/:conversationId", async (request, reply) => {
    const { tenantId, userId } = requestIdentity(request.headers);
    const { conversationId } = request.params;
    const active = executionReader.getActive(tenantId, userId, conversationId);
    const pendingApprovals = approvalReader.listPending(tenantId, userId, conversationId);
    const scopedEvents = runtimeEventStore.since(tenantId, userId, conversationId, null);
    const hasScopedRuntimeState = active != null || pendingApprovals.length > 0 || scopedEvents.length > 0;
    const messages = history.get(tenantId, userId, conversationId);
    const runtimeProgress = progressForSession(runtimeEventStore, executionStateStore, tenantId, userId, conversationId, active?.executionId);
    if (messages.length === 0 && !hasScopedRuntimeState) {
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
            startedAt: "startedAt" in active ? active.startedAt : active.createdAt,
            updatedAt: active.updatedAt,
            endedAt: "endedAt" in active ? active.endedAt : undefined,
            endReason: "endReason" in active
              ? active.endReason
              : "stopReason" in active ? active.stopReason ?? undefined : undefined
          }
        : null,
      ...(runtimeProgress ? { runtimeProgress } : {}),
      pendingApprovals: sanitizePendingApprovals(pendingApprovals)
    });
  });

  app.post<{
    Params: { conversationId: string; executionId: string; toolCallId: string };
    Body: Partial<ApprovalDecision>;
  }>("/api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId", async (request, reply) => {
    const { conversationId, executionId, toolCallId } = request.params;
    const { tenantId, userId, traceId, requestId } = requestIdentity(request.headers);
    const pending = approvalReader.get(tenantId, userId, conversationId, executionId, toolCallId);
    if (!pending) {
      reply.status(404).send({
        error: {
          errorClass: "APPROVAL_NOT_FOUND",
          errorMessage: `Approval not found: ${executionId}/${toolCallId}`
        }
      });
      return;
    }
    const decision = toApprovalDecision(request.body);
    if (options.runtimeContext) {
      const committed = options.runtimeContext.lifecycle.decideApproval({
        tenantId,
        userId,
        conversationId,
        executionId,
        traceId,
        requestId,
        approvalId: pending.askUserId,
        nextStatus: approvalLifecycleStatus(decision.action)
      });
      publishCommittedLifecycleEvents(options.runtimeContext.liveEvents, committed);
    }
    approvalStore.decide(tenantId, userId, conversationId, executionId, toolCallId, decision);
    reply.send({
      executionId,
      toolCallId,
      status: approvalStatus(decision.action)
    });
  });

  app.delete<{ Params: { conversationId: string } }>("/api/v1/sessions/:conversationId", async (request, reply) => {
    const { tenantId, userId } = requestIdentity(request.headers);
    const { conversationId } = request.params;
    await history.delete(tenantId, userId, conversationId);
    reply.status(204).send();
  });

  // ── Abort Execution API ────────────────────────────────────────────────────

  app.post<{
    Params: { conversationId: string; executionId: string };
  }>("/api/v1/sessions/:conversationId/executions/:executionId/abort", async (request, reply) => {
    const { conversationId, executionId } = request.params;
    const { tenantId, userId } = requestIdentity(request.headers);
    const state = executionReader.get(tenantId, userId, conversationId, executionId);
    if (!state) {
      reply.status(404).send({
        error: { errorClass: "EXECUTION_NOT_FOUND", errorMessage: `Execution not found: ${executionId}` }
      });
      return;
    }
    // No-op if already terminal.
    if (options.runtimeContext) {
      const identity = requestIdentity(request.headers);
      const committed = options.runtimeContext.lifecycle.abortExecution({
        tenantId,
        userId,
        conversationId,
        executionId,
        traceId: identity.traceId,
        requestId: identity.requestId,
        errorMessage: "Execution was aborted by client"
      });
      publishCommittedLifecycleEvents(options.runtimeContext.liveEvents, committed);
    }
    for (const pending of approvalStore.listPending(tenantId, userId, conversationId)) {
      if (pending.executionId !== executionId) continue;
      approvalStore.decide(tenantId, userId, conversationId, executionId, pending.toolCallId, {
        action: "reject",
        message: "EXECUTION_ABORTED",
        respondedAt: new Date().toISOString()
      });
    }
    const processState = executionStateStore.get(tenantId, userId, conversationId, executionId);
    if (processState) {
      executionStateStore.abort(tenantId, userId, conversationId, executionId);
    }
    const after = executionStateStore.get(tenantId, userId, conversationId, executionId) ?? state;
    reply.send({ executionId: after.executionId, status: after.status });
  });

  // Expose askUserStore for stream loop to create pendings
  (app as unknown as { askUserStore: AskUserStore }).askUserStore = askUserStore;

  return app;
}

const defaultDevelopmentStoreFactories: DevelopmentStoreFactories = {
  history: () => createHistoryStore(),
  memory: () => new JsonFileMemoryStore(),
  events: () => new InMemoryRuntimeEventStore(),
  executions: () => new InMemoryExecutionStateStore(),
  approvals: () => new JsonFileApprovalStore()
};

export async function createProductionServer(options: CreateProductionServerOptions) {
  if (!options.serviceToken.trim()) throw new Error("Production Runtime service token is required");
  const context = openProductionRuntimeContext(options.databasePath, {
    expectedDatabaseIdentity: options.expectedDatabaseIdentity
  });
  try {
    const app = await createServer({
      runtimeContext: context,
      javaClient: options.javaClient,
      javaBaseUrl: options.javaBaseUrl,
      frontendUrl: options.frontendUrl,
      mcpRegistry: options.mcpRegistry,
      disableMcp: options.disableMcp,
      serviceToken: options.serviceToken,
      requireServiceAuth: true
    });
    app.addHook("onClose", async () => context.close());
    return app;
  } catch (error) {
    context.close();
    throw error;
  }
}

function productionRuntimeEventStore(context: ProductionRuntimeContext): RuntimeEventStore {
  return {
    append(tenantId, userId, conversationId, event) {
      const committed = context.lifecycle.recordEvent({
        tenantId,
        userId,
        conversationId,
        executionId: event.executionId,
        traceId: event.traceId,
        requestId: event.requestId,
        kind: event.kind,
        data: event.data
      });
      publishCommittedLifecycleEvents(context.liveEvents, committed);
      return committed.events[0];
    },
    publish: event => context.liveEvents.publish(event),
    subscribe: (tenantId, userId, conversationId, listener) => context.liveEvents.subscribe(tenantId, userId, conversationId, listener),
    since: (tenantId, userId, conversationId, afterEventId) => context.events.since(tenantId, userId, conversationId, afterEventId),
    latestEventId: (tenantId, userId, conversationId) => context.events.latestEventId(tenantId, userId, conversationId),
    hasEvent: (tenantId, userId, conversationId, eventId) => context.events.hasEvent(tenantId, userId, conversationId, eventId)
  };
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestIdentity(headers: Record<string, string | string[] | undefined>): {
  tenantId: string;
  userId: string;
  traceId: string;
  requestId: string;
} {
  return {
    tenantId: header(headers["x-tenant-id"]) ?? "tenant-001",
    userId: header(headers["x-user-id"])!,
    traceId: header(headers["x-trace-id"]) ?? crypto.randomUUID(),
    requestId: header(headers["x-request-id"]) ?? crypto.randomUUID()
  };
}

function requiredIdentityHeaders(headers: Record<string, string | string[] | undefined>): string[] {
  const required = ["x-tenant-id", "x-user-id", "x-trace-id", "x-request-id"] as const;
  return required.filter((name) => {
    const value = headers[name];
    return Array.isArray(value) || header(value)?.trim() === "" || header(value) === undefined;
  });
}

function validBearer(authorization: string | undefined, expectedToken: string): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  const actual = Buffer.from(authorization.slice(prefix.length));
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sanitizePendingApprovals(approvals: ReturnType<ApprovalStore["listPending"]>) {
  return approvals.map(({ approvalToken: _approvalToken, ...approval }) => approval);
}

function latestScopedEventId(
  runtimeEventStore: RuntimeEventStore,
  tenantId: string,
  userId: string,
  conversationId: string
): string | null {
  const events = runtimeEventStore.since(tenantId, userId, conversationId, null);
  return events[events.length - 1]?.eventId ?? null;
}

function eventsAfter(events: SessionEvent[], afterEventId: string | null): SessionEvent[] {
  if (afterEventId == null) return events;
  const index = events.findIndex((event) => event.eventId === afterEventId);
  return index === -1 ? [] : events.slice(index + 1);
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

function approvalLifecycleStatus(action: ApprovalDecision["action"]): "approved" | "rejected" | "revised" {
  return approvalStatus(action);
}

function buildSyncResponse(
  tenantId: string,
  userId: string,
  conversationId: string,
  executionId: string,
  traceId: string,
  requestId: string,
  stopReason: StopReason | undefined,
  runtimeEventStore: RuntimeEventStore
): AgentChatResponse {
  const events = runtimeEventStore
    .since(tenantId, userId, conversationId, null)
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
  userId: string,
  conversationId: string,
  activeExecutionId?: string
) {
  const allEvents = runtimeEventStore.since(tenantId, userId, conversationId, null);
  const executionId = activeExecutionId ?? allEvents[allEvents.length - 1]?.executionId;
  if (!executionId) return null;
  const events = allEvents.filter((event) => event.executionId === executionId);
  return deriveRuntimeProgress({
    events,
    state: executionStateStore.get(tenantId, userId, conversationId, executionId)
  });
}
