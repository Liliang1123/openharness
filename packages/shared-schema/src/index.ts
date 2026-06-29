import { z } from "zod";

export const RuntimeNameSchema = z.enum(["frontend", "agent-runtime", "backend"]);
export type RuntimeName = z.infer<typeof RuntimeNameSchema>;

export const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const TraceStatusSchema = z.enum(["ok", "error", "timeout"]);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;

export const ReviewDecisionSchema = z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]);
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const DecisionSourceSchema = z.enum([
  "ORG_POLICY",
  "AGENT_DEFINITION",
  "SKILL_MANIFEST",
  "CALLER_OVERRIDE",
  "TOOL_METADATA",
  "MCP_DEFAULT",
  "MCP_REQUIRE_APPROVAL",
  "UNTRUSTED_CONTEXT",
  "NONE"
]);
export type DecisionSource = z.infer<typeof DecisionSourceSchema>;

export const ToolResultProvenanceSchema = z.enum(["trusted", "untrusted"]);
export type ToolResultProvenance = z.infer<typeof ToolResultProvenanceSchema>;

export const ContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    imageUrl: z.object({ url: z.string() }).optional(),
    passthrough: z.boolean().optional()
  })
  .passthrough();
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const ReasoningBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    signature: z.string().optional(),
    data: z.string().optional()
  })
  .passthrough();
export type ReasoningBlock = z.infer<typeof ReasoningBlockSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  argumentsRaw: z.string(),
  source: z.string().optional()
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const AgentMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  toolResultProvenance: ToolResultProvenanceSchema.optional(),
  reasoningBlocks: z.array(ReasoningBlockSchema).optional(),
  requestId: z.string().optional(),
  conversationId: z.string().optional(),
  taskId: z.string().optional(),
  systemInjected: z.boolean().optional(),
  sessionContext: z.boolean().optional(),
  compressedSummary: z.boolean().optional(),
  compressionInstruction: z.boolean().optional(),
  transient: z.boolean().optional()
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: string[];
  description?: string;
  [key: string]: unknown;
};

export const JsonSchemaSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      properties: z.record(JsonSchemaSchema).optional(),
      required: z.array(z.string()).optional(),
      enum: z.array(z.string()).optional(),
      description: z.string().optional()
    })
    .passthrough()
);

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: JsonSchemaSchema,
  catalogVersion: z.string().optional(),
  catalogHash: z.string().optional(),
  permission: z.enum(["safe", "sensitive", "destructive"]),
  isReadOnly: z.boolean(),
  isDestructive: z.boolean(),
  requiresApproval: z.boolean(),
  isConcurrencySafe: z.boolean().optional(),
  protocol: z.enum(["read_file", "search", "run_command", "edit_file"]).optional()
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolResultSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  status: z.enum(["ok", "error", "rejected", "timeout"]),
  errorClass: z.string().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const CacheHintSchema = z.object({
  messageIndexFromTail: z.number().int().positive(),
  scope: z.enum(["message", "tool_result_block"])
});
export type CacheHint = z.infer<typeof CacheHintSchema>;

export const PromptTemplateSchema = z.object({
  promptId: z.string().min(1),
  version: z.string().min(1),
  role: z.literal("system"),
  content: z.string().min(1),
  description: z.string().optional()
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

const IdentifierSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const PromptRefSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*@[a-zA-Z][a-zA-Z0-9_.-]*$/);
const ToolNameSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/);

export const AgentDefinitionSchema = z
  .object({
    agentId: IdentifierSchema,
    promptRef: PromptRefSchema,
    tools: z.array(ToolNameSchema).default([]).refine((tools) => new Set(tools).size === tools.length, {
      message: "tools must be unique"
    }),
    model: z.string().min(1).optional()
  })
  .strict();
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const ContextBuildMetaSchema = z.object({
  builder: z.literal("default"),
  selectedMessages: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  budgetTokens: z.number().int().positive(),
  layers: z.array(z.string()),
  truncated: z.boolean()
});
export type ContextBuildMeta = z.infer<typeof ContextBuildMetaSchema>;

export const MemoryFactSchema = z.object({
  memoryId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MemoryFact = z.infer<typeof MemoryFactSchema>;

export const MemorySearchQuerySchema = z.object({
  query: z.string().default(""),
  tags: z.array(z.string().min(1)).default([])
}).strict();
export type MemorySearchQuery = z.infer<typeof MemorySearchQuerySchema>;

export const MemoryUpsertRequestSchema = z.object({
  memoryId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).default([])
}).strict();
export type MemoryUpsertRequest = z.infer<typeof MemoryUpsertRequestSchema>;

export const MemoryListResponseSchema = z.object({
  facts: z.array(MemoryFactSchema)
}).strict();
export type MemoryListResponse = z.infer<typeof MemoryListResponseSchema>;

export const MemoryDeleteResponseSchema = z.object({
  memoryId: z.string().min(1),
  deleted: z.boolean()
}).strict();
export type MemoryDeleteResponse = z.infer<typeof MemoryDeleteResponseSchema>;

export const EvalCaseSchema = z.object({
  evalId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  conversationId: z.string().min(1),
  input: z.string().min(1),
  expectedAnswerContains: z.string().min(1).optional(),
  expectedStopReason: z.enum([
    "FINAL_ANSWER",
    "MODEL_ERROR",
    "TOOL_ERROR",
    "POLICY_DENY",
    "APPROVAL_TIMEOUT",
    "EXECUTION_TIMEOUT",
    "STEP_BUDGET_EXHAUSTED",
    "EVENT_REPLAY_GAP",
    "EXECUTION_ABORTED",
    "EMPTY_MODEL_RESPONSE"
  ]).optional()
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export const ModelChatRequestMetaSchema = z.object({
  cacheEnabled: z.boolean(),
  cacheHints: z.array(CacheHintSchema).optional(),
  provider: z.string().optional(),
  catalogVersion: z.string().optional(),
  catalogHash: z.string().optional(),
  promptId: z.string().optional(),
  promptVersion: z.string().optional(),
  context: ContextBuildMetaSchema.optional(),
  agentId: z.string().optional(),
  agentPromptRef: z.string().optional(),
  agentToolMode: z.enum(["default_full", "allow_list"]).optional(),
  agentAllowedTools: z.array(z.string()).optional(),
  modelVisibleTools: z.array(z.string()).optional()
});
export type ModelChatRequestMeta = z.infer<typeof ModelChatRequestMetaSchema>;

export const ModelChatRequestSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  model: z.string(),
  stream: z.boolean(),
  messages: z.array(AgentMessageSchema),
  tools: z.array(ToolDefinitionSchema),
  meta: ModelChatRequestMetaSchema
});
export type ModelChatRequest = z.infer<typeof ModelChatRequestSchema>;

export const UsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  totalIsPerTurn: z.boolean().optional(),
  costUsdMicros: z.number().int().nonnegative().optional()
});
export type Usage = z.infer<typeof UsageSchema>;

export const StructuredErrorSchema = z.object({
  errorClass: z.string(),
  errorMessage: z.string(),
  retriable: z.boolean(),
  retryOwner: z.enum(["java", "ts", "none"]).optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  fallbackAllowed: z.boolean().optional(),
  httpStatus: z.number().int().optional(),
  recoveryHint: z.record(z.unknown()).optional()
});
export type StructuredError = z.infer<typeof StructuredErrorSchema>;

export const ModelChatResponseSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  message: AgentMessageSchema.optional(),
  usage: UsageSchema.optional(),
  rawProvider: z.string(),
  error: StructuredErrorSchema.optional()
});
export type ModelChatResponse = z.infer<typeof ModelChatResponseSchema>;

export const ToolCallRequestSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()),
  catalogVersion: z.string(),
  catalogHash: z.string(),
  idempotencyKey: z.string(),
  approvalToken: z.string().optional()
});
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;

export const ToolCallResponseOkSchema = z
  .object({
    requestId: z.string(),
    conversationId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    result: z.unknown().optional(),
    status: z.literal("ok"),
    idempotentReplay: z.boolean().optional(),
    provenance: ToolResultProvenanceSchema.optional()
  })
  .strict();
export type ToolCallResponseOk = z.infer<typeof ToolCallResponseOkSchema>;

export const ToolCallResponseFailureSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  status: z.enum(["error", "rejected", "timeout"]),
  idempotentReplay: z.boolean().optional(),
  error: StructuredErrorSchema,
  provenance: ToolResultProvenanceSchema.optional()
});
export type ToolCallResponseFailure = z.infer<typeof ToolCallResponseFailureSchema>;

export const ToolCallResponseSchema = z.discriminatedUnion("status", [
  ToolCallResponseOkSchema,
  ToolCallResponseFailureSchema
]);
export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;

export const TraceNodeKindSchema = z.enum([
  "agent_execution",
  "subagent_execution",
  "model_call",
  "tool_call",
  "summary"
]);
export type TraceNodeKind = z.infer<typeof TraceNodeKindSchema>;

export const TraceTreeAttributesSchema = z
  .object({
    traceNodeKind: TraceNodeKindSchema,
    executionId: z.string().optional(),
    parentExecutionId: z.string().optional(),
    childExecutionId: z.string().optional(),
    childConversationId: z.string().optional(),
    skillName: z.string().optional(),
    toolCallId: z.string().optional(),
    stepIndex: z.number().int().nonnegative().optional(),
    terminalClass: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
    costUsdMicros: z.number().int().nonnegative().optional(),
    traceIngestionStatus: z.enum(["posted", "failed", "skipped"]).optional()
  })
  .passthrough();
export type TraceTreeAttributes = z.infer<typeof TraceTreeAttributesSchema>;

export const TraceEventSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  requestId: z.string(),
  conversationId: z.string(),
  taskId: z.string().optional(),
  userId: z.string(),
  tenantId: z.string(),
  agentId: z.string().optional(),
  runtime: RuntimeNameSchema,
  eventType: z.string(),
  name: z.string(),
  attributes: z.record(z.unknown()).optional(),
  status: TraceStatusSchema,
  errorClass: z.string().optional(),
  errorMessage: z.string().optional(),
  startTime: z.number(),
  endTime: z.number().optional(),
  durationMs: z.number().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  costUsdMicros: z.number().int().nonnegative().optional(),
  redacted: z.boolean().optional()
});
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const ConversationLifecycleSchema = z.object({
  conversationId: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  agentId: z.string().optional(),
  status: z.enum(["active", "pending_user", "completed", "failed", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ConversationLifecycle = z.infer<typeof ConversationLifecycleSchema>;

export const LoadedSkillPolicySchema = z.object({
  name: z.string(),
  requiresApprovalFor: z.array(z.string())
});
export type LoadedSkillPolicy = z.infer<typeof LoadedSkillPolicySchema>;

export const ToolContextSchema = z.object({
  orgId: z.string().optional(),
  agentId: z.string().optional(),
  loadedSkills: z.array(LoadedSkillPolicySchema).optional(),
  callerRequireApproval: z.boolean().optional(),
  catalogVersion: z.string().optional(),
  catalogHash: z.string().optional(),
  untrustedToolOutputSinceLastUser: z.boolean().optional(),
  toolPermissions: z.record(z.enum(["safe", "sensitive", "destructive"])).optional()
});
export type ToolContext = z.infer<typeof ToolContextSchema>;

export const ReviewPolicyEvaluateRequestSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  traceId: z.string(),
  toolCalls: z.array(ToolCallSchema),
  context: ToolContextSchema
});
export type ReviewPolicyEvaluateRequest = z.infer<typeof ReviewPolicyEvaluateRequestSchema>;

export const ReviewDecisionItemSchema = z.object({
  toolCallId: z.string(),
  decision: ReviewDecisionSchema,
  source: DecisionSourceSchema,
  reason: z.string().optional(),
  reviewerUserId: z.string().optional(),
  approvalToken: z.string().optional(),
  error: StructuredErrorSchema.optional()
});
export type ReviewDecisionItem = z.infer<typeof ReviewDecisionItemSchema>;

export const ReviewPolicyEvaluateResponseSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  decisions: z.array(ReviewDecisionItemSchema)
});
export type ReviewPolicyEvaluateResponse = z.infer<typeof ReviewPolicyEvaluateResponseSchema>;

export const AskUserRequestSchema = z.object({
  askUserId: z.string(),
  requestId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  prompt: z.string(),
  attachment: z.unknown().optional(),
  pendingToolCall: ToolCallSchema.optional(),
  reason: z.string().optional(),
  decisionSource: DecisionSourceSchema.exclude(["NONE"]).optional(),
  decisionReason: z.string().optional(),
  approvalToken: z.string().optional(),
  expiresAt: z.string().optional()
});
export type AskUserRequest = z.infer<typeof AskUserRequestSchema>;

export const AskUserResponseSchema = z.object({
  askUserId: z.string(),
  action: z.enum(["approve", "reject", "revise", "answer"]),
  message: z.string().optional(),
  revisedArguments: z.record(z.unknown()).optional(),
  respondedAt: z.string()
});
export type AskUserResponse = z.infer<typeof AskUserResponseSchema>;

// ── Runtime Events (add-execution-lifecycle-and-stream-recovery Phase 1) ──

export const RuntimeEventKindSchema = z.enum([
  "agent_start",
  "model_call_start",
  "model_call_end",
  "tool_call",
  "tool_result",
  "trace",
  "step_budget_exhausted",
  "final_answer",
  "agent_end",
  "stream_done",
  "stream_error",
  "stream_resync_required",
  "approval_requested"
]);
export type RuntimeEventKind = z.infer<typeof RuntimeEventKindSchema>;

export const SessionEventSchema = z.object({
  eventId: z.string(),
  executionId: z.string(),
  conversationId: z.string(),
  tenantId: z.string(),
  traceId: z.string(),
  requestId: z.string(),
  createdAt: z.number(),
  kind: RuntimeEventKindSchema,
  data: z.record(z.unknown())
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;
