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
    "EXECUTION_INTERRUPTED",
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

const CodexIdentifierSchema = z.string().min(1).max(256);
const CodexContentSchema = z.string().max(65_536);
const MAX_CANONICAL_JSON_NESTING = 128;

function hasBoundedJsonNesting(raw: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of raw) {
    if (inString) {
      if (!escaped && character === "\"") inString = false;
      escaped = !escaped && character === "\\";
      continue;
    }
    if (character === "\"") {
      inString = true;
    } else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > MAX_CANONICAL_JSON_NESTING) return false;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inString;
}

class CanonicalJsonParser {
  private position = 0;

  constructor(private readonly raw: string) {}

  parseObjectText(): boolean {
    return this.parseObject() && this.position === this.raw.length;
  }

  private parseValue(): boolean {
    const character = this.raw[this.position];
    if (character === "{") return this.parseObject();
    if (character === "[") return this.parseArray();
    if (character === "\"") return this.parseString() !== undefined;
    if (character === "t") return this.consume("true");
    if (character === "f") return this.consume("false");
    if (character === "n") return this.consume("null");
    return this.parseNumber();
  }

  private parseObject(): boolean {
    if (!this.consume("{")) return false;
    if (this.consume("}")) return true;

    const keys = new Set<string>();
    let previousKey: string | undefined;
    while (true) {
      const key = this.parseString();
      if (key === undefined || keys.has(key) || (previousKey !== undefined && previousKey >= key)) return false;
      keys.add(key);
      previousKey = key;
      if (!this.consume(":") || !this.parseValue()) return false;
      if (this.consume("}")) return true;
      if (!this.consume(",")) return false;
    }
  }

  private parseArray(): boolean {
    if (!this.consume("[")) return false;
    if (this.consume("]")) return true;
    while (true) {
      if (!this.parseValue()) return false;
      if (this.consume("]")) return true;
      if (!this.consume(",")) return false;
    }
  }

  private parseString(): string | undefined {
    if (this.raw[this.position] !== "\"") return undefined;
    const start = this.position++;
    let escaped = false;
    while (this.position < this.raw.length) {
      const character = this.raw[this.position++];
      if (!escaped && character === "\"") {
        const token = this.raw.slice(start, this.position);
        try {
          const decoded: unknown = JSON.parse(token);
          if (typeof decoded !== "string" || JSON.stringify(decoded) !== token || this.hasLoneSurrogate(decoded)) {
            return undefined;
          }
          return decoded;
        } catch {
          return undefined;
        }
      }
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
    }
    return undefined;
  }

  private parseNumber(): boolean {
    const match = this.raw.slice(this.position).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?/);
    if (!match) return false;
    const token = match[0];
    const value = Number(token);
    if (!Number.isFinite(value) || Object.is(value, -0) || JSON.stringify(value) !== token) return false;
    this.position += token.length;
    return true;
  }

  private hasLoneSurrogate(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
      const codeUnit = value.charCodeAt(index);
      if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
        if (index + 1 >= value.length) return true;
        const next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return true;
        index += 1;
      } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  private consume(expected: string): boolean {
    if (!this.raw.startsWith(expected, this.position)) return false;
    this.position += expected.length;
    return true;
  }
}

const CanonicalJsonObjectTextSchema = z.string().min(2).max(65_536).refine((raw) => {
  return hasBoundedJsonNesting(raw) && new CanonicalJsonParser(raw).parseObjectText();
}, "argumentsRaw must be canonical JSON object text");

const UtcExpirySchema = z.string().refine((raw) => {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?Z$/.exec(raw);
  if (!match) return false;
  const normalized = `${match[1]}${match[2] ?? ".000"}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === normalized;
}, "expiresAt must be a valid UTC timestamp with seconds or milliseconds precision");

export const PendingCodexTurnSchema = z
  .object({
    bridgeId: CodexIdentifierSchema,
    threadId: CodexIdentifierSchema,
    turnId: CodexIdentifierSchema,
    callId: CodexIdentifierSchema,
    toolName: z.string().min(1).max(256),
    argumentsRaw: CanonicalJsonObjectTextSchema,
    expiresAt: UtcExpirySchema
  })
  .strict();
export type PendingCodexTurn = z.infer<typeof PendingCodexTurnSchema>;

export const CodexToolResultSubmissionSchema = z
  .object({
    requestId: CodexIdentifierSchema,
    conversationId: CodexIdentifierSchema,
    threadId: CodexIdentifierSchema,
    turnId: CodexIdentifierSchema,
    callId: CodexIdentifierSchema,
    idempotencyKey: CodexIdentifierSchema,
    status: z.enum(["ok", "error", "rejected", "timeout"]),
    content: CodexContentSchema
  })
  .strict();
export type CodexToolResultSubmission = z.infer<typeof CodexToolResultSubmissionSchema>;

export const CodexTurnCancelRequestSchema = z
  .object({
    requestId: CodexIdentifierSchema,
    conversationId: CodexIdentifierSchema,
    threadId: CodexIdentifierSchema,
    turnId: CodexIdentifierSchema,
    callId: CodexIdentifierSchema
  })
  .strict();
export type CodexTurnCancelRequest = z.infer<typeof CodexTurnCancelRequestSchema>;

export const ModelChatResponseSchema = z.object({
  requestId: z.string().min(1).max(256),
  conversationId: z.string().min(1).max(256),
  message: AgentMessageSchema.optional(),
  pendingTurn: PendingCodexTurnSchema.optional(),
  usage: UsageSchema.optional(),
  rawProvider: z.string().min(1).max(256),
  error: StructuredErrorSchema.optional(),
  idempotentReplay: z.boolean().optional()
}).strict().superRefine((response, context) => {
  const outcomeCount = [response.message, response.pendingTurn, response.error]
    .filter((outcome) => outcome !== undefined).length;
  if (outcomeCount !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "exactly one of message, pendingTurn, or error is required"
    });
  }
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

export const ToolCancelRequestSchema = z
  .object({
    requestId: z.string(),
    toolCallId: z.string()
  })
  .strict();
export type ToolCancelRequest = z.infer<typeof ToolCancelRequestSchema>;

export const ToolCancelResponseSchema = z
  .object({
    requestId: z.string(),
    toolCallId: z.string(),
    cancelled: z.boolean()
  })
  .strict();
export type ToolCancelResponse = z.infer<typeof ToolCancelResponseSchema>;

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

export const QualificationTrackSchema = z.enum(["local", "production"]);
export type QualificationTrack = z.infer<typeof QualificationTrackSchema>;

export const QualificationRowResultSchema = z.enum(["pass", "fail", "blocked"]);
export type QualificationRowResult = z.infer<typeof QualificationRowResultSchema>;

export const QualificationReportResultSchema = z.enum(["pass", "fail", "blocked", "local_verified"]);
export type QualificationReportResult = z.infer<typeof QualificationReportResultSchema>;

export const QualificationMatrixRowSchema = z
  .object({
    id: z.string().min(1),
    required: z.boolean(),
    track: QualificationTrackSchema,
    environment: z.record(z.unknown()),
    protocolVersion: z.string().min(1),
    capabilities: z.array(z.string()),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/i),
    observed: z.record(z.unknown()),
    oracle: z.record(z.unknown()),
    usage: z.record(z.number().nonnegative()).optional(),
    cost: z
      .object({
        currency: z.string().min(1),
        micros: z.number().int().nonnegative()
      })
      .strict()
      .optional(),
    durationMs: z.number().nonnegative(),
    result: QualificationRowResultSchema
  })
  .strict();
export type QualificationMatrixRow = z.infer<typeof QualificationMatrixRowSchema>;

export const QualificationReportSchema = z
  .object({
    track: QualificationTrackSchema,
    generatedAt: z.string().datetime(),
    result: QualificationReportResultSchema,
    rows: z.array(QualificationMatrixRowSchema)
  })
  .strict()
  .superRefine((report, context) => {
    if (report.rows.some((row) => row.track !== report.track)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "row track must match report track", path: ["rows"] });
    }
    // local track validation
    if (report.track === "local") {
      if (report.result === "pass") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "local track report result cannot be 'pass'; must use 'local_verified', 'fail', or 'blocked'",
          path: ["result"]
        });
      }
      if (report.result === "local_verified" && report.rows.some((row) => row.required && row.result !== "pass")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "required blocked or failed rows prevent overall local_verified",
          path: ["result"]
        });
      }
    }
    // production track validation
    if (report.track === "production") {
      if (report.result === "local_verified") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "production track report result cannot be 'local_verified'",
          path: ["result"]
        });
      }
      if (report.result === "pass" && report.rows.some((row) => row.required && row.result !== "pass")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "required blocked or failed rows prevent overall pass",
          path: ["result"]
        });
      }
    }
  });
export type QualificationReport = z.infer<typeof QualificationReportSchema>;

export const GateCProviderEvidencePathSchema = z.string().min(1).refine((path) => {
  if (path.startsWith("/") || /^[a-zA-Z]:\//.test(path) || path.includes("\\")) {
    return false;
  }
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}, "evidence path must be a normalized project-relative path");
export type GateCProviderEvidencePath = z.infer<typeof GateCProviderEvidencePathSchema>;

export const GateCProviderEvidenceRefSchema = z
  .object({
    authority: z.enum(["required", "advisory"]),
    path: GateCProviderEvidencePathSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    track: QualificationTrackSchema,
    reportResult: QualificationReportResultSchema
  })
  .strict();
export type GateCProviderEvidenceRef = z.infer<typeof GateCProviderEvidenceRefSchema>;

export const GateCRequiredRowIdsSchema = z.tuple([
  z.literal("codex-real-sync"),
  z.literal("codex-real-reasoning"),
  z.literal("codex-real-usage"),
  z.literal("codex-real-stream"),
  z.literal("codex-real-cancellation"),
  z.literal("codex-real-redaction")
]);
export type GateCRequiredRowIds = z.infer<typeof GateCRequiredRowIdsSchema>;

export const GateCProviderDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    policy: z.literal("codex-oauth-required-v1"),
    generatedAt: z.string().datetime(),
    result: z.enum(["pass", "blocked"]),
    required: GateCProviderEvidenceRefSchema.extend({
      authority: z.literal("required"),
      clientImplementationSha256: z.string().regex(/^[a-f0-9]{64}$/),
      requiredRowIds: GateCRequiredRowIdsSchema
    }).strict(),
    advisory: z.array(GateCProviderEvidenceRefSchema.extend({
      authority: z.literal("advisory")
    }).strict()),
    blockers: z.array(z.string().min(1))
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.result === "pass" && decision.blockers.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockers"],
        message: "pass decision cannot contain blockers"
      });
    }
    if (decision.result === "pass"
      && (decision.required.track !== "production" || decision.required.reportResult !== "pass")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["required"],
        message: "pass decision requires a production pass report"
      });
    }
    if (decision.result === "blocked" && decision.blockers.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockers"],
        message: "blocked decision must contain blockers"
      });
    }
  });
export type GateCProviderDecision = z.infer<typeof GateCProviderDecisionSchema>;

export const RuntimeBaselineOperationKindSchema = z.enum(["no_tool", "java_sandbox", "mcp", "approval_interruption"]);
export type RuntimeBaselineOperationKind = z.infer<typeof RuntimeBaselineOperationKindSchema>;

export const RuntimeBaselineOperationSchema = z
  .object({
    operationId: z.string().min(1),
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    conversationId: z.string().min(1),
    kind: RuntimeBaselineOperationKindSchema
  })
  .strict();
export type RuntimeBaselineOperation = z.infer<typeof RuntimeBaselineOperationSchema>;

export const RuntimeBaselineWorkloadMixSchema = z
  .object({
    noTool: z.number().nonnegative(),
    javaSandbox: z.number().nonnegative(),
    mcp: z.number().nonnegative(),
    approvalInterruption: z.number().nonnegative()
  })
  .strict()
  .superRefine((mix, context) => {
    const total = mix.noTool + mix.javaSandbox + mix.mcp + mix.approvalInterruption;
    if (Math.abs(total - 1) > 0.000001) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "runtime baseline workload mix must sum to 1" });
    }
  });
export type RuntimeBaselineWorkloadMix = z.infer<typeof RuntimeBaselineWorkloadMixSchema>;

export const RuntimeBaselineWorkloadSchema = z
  .object({
    seededConversations: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    mix: RuntimeBaselineWorkloadMixSchema,
    operations: z.array(RuntimeBaselineOperationSchema).optional()
  })
  .strict();
export type RuntimeBaselineWorkload = z.infer<typeof RuntimeBaselineWorkloadSchema>;

export const RuntimeBaselineThresholdsSchema = z
  .object({
    admissionP95Ms: z.number().nonnegative(),
    durableReplayP95Ms: z.number().nonnegative(),
    rssBytes: z.number().int().nonnegative(),
    openFileDescriptors: z.number().int().nonnegative(),
    walBytes: z.number().int().nonnegative(),
    mcpChildCount: z.number().int().nonnegative(),
    sustainedBreachMs: z.number().int().positive()
  })
  .strict();
export type RuntimeBaselineThresholds = z.infer<typeof RuntimeBaselineThresholdsSchema>;

export const RuntimeBaselineSampleSchema = z
  .object({
    sampledAt: z.string().datetime(),
    admissionP95Ms: z.number().nonnegative(),
    durableReplayP95Ms: z.number().nonnegative(),
    rssBytes: z.number().int().nonnegative(),
    openFileDescriptors: z.number().int().nonnegative(),
    walBytes: z.number().int().nonnegative(),
    mcpChildCount: z.number().int().nonnegative(),
    hardFailures: z.array(z.string().min(1))
  })
  .strict();
export type RuntimeBaselineSample = z.infer<typeof RuntimeBaselineSampleSchema>;

export const RuntimeBaselineFailureSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: z.enum(["hard", "threshold"]),
    metric: z.string().min(1).optional()
  })
  .strict();
export type RuntimeBaselineFailure = z.infer<typeof RuntimeBaselineFailureSchema>;

export const RuntimeBaselineReportSchema = z
  .object({
    track: QualificationTrackSchema,
    generatedAt: z.string().datetime(),
    result: QualificationReportResultSchema,
    workload: RuntimeBaselineWorkloadSchema,
    environment: z.record(z.unknown()),
    thresholds: RuntimeBaselineThresholdsSchema,
    samples: z.array(RuntimeBaselineSampleSchema),
    failures: z.array(RuntimeBaselineFailureSchema),
    reportHash: z.string().regex(/^[a-f0-9]{64}$/i)
  })
  .strict()
  .superRefine((report, context) => {
    if (report.track === "local" && report.result === "pass") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "local baseline report result cannot be 'pass'; must use 'local_verified', 'fail', or 'blocked'",
        path: ["result"]
      });
    }
    if (report.track === "production" && report.result === "local_verified") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "production baseline report result cannot be 'local_verified'",
        path: ["result"]
      });
    }
    if ((report.result === "pass" || report.result === "local_verified") && report.failures.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "passing baseline report cannot contain failures",
        path: ["failures"]
      });
    }
  });
export type RuntimeBaselineReport = z.infer<typeof RuntimeBaselineReportSchema>;

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

// ── Runtime Progress ────────────────────────────────────────────────────────

export const RuntimeProgressStatusSchema = z.enum([
  "running",
  "waiting_approval",
  "completed",
  "aborted",
  "errored"
]);
export type RuntimeProgressStatus = z.infer<typeof RuntimeProgressStatusSchema>;

export const RuntimeProgressActivitySchema = z.enum([
  "idle",
  "model_call",
  "tool_call",
  "subagent",
  "waiting_approval",
  "terminal"
]);
export type RuntimeProgressActivity = z.infer<typeof RuntimeProgressActivitySchema>;

export const RuntimeProgressDetailSchema = z
  .object({
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    skillName: z.string().optional(),
    childExecutionId: z.string().optional(),
    childConversationId: z.string().optional(),
    askUserId: z.string().optional(),
    terminalClass: z.string().optional(),
    reason: z.string().optional(),
    costUsdMicros: z.number().int().nonnegative().optional()
  })
  .strict();
export type RuntimeProgressDetail = z.infer<typeof RuntimeProgressDetailSchema>;

export const RuntimeProgressRecentEventSchema = z
  .object({
    kind: z.string(),
    createdAt: z.number().int().nonnegative(),
    stepIndex: z.number().int().positive().optional(),
    status: z.string().optional(),
    toolName: z.string().optional()
  })
  .strict();
export type RuntimeProgressRecentEvent = z.infer<typeof RuntimeProgressRecentEventSchema>;

export const RuntimeProgressSnapshotSchema = z
  .object({
    conversationId: z.string(),
    executionId: z.string(),
    tenantId: z.string(),
    traceId: z.string(),
    requestId: z.string(),
    status: RuntimeProgressStatusSchema,
    currentActivity: RuntimeProgressActivitySchema,
    startedAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    endedAt: z.number().int().nonnegative().nullable().optional(),
    elapsedMs: z.number().int().nonnegative().optional(),
    currentStep: z.number().int().positive().optional(),
    maxObservedStep: z.number().int().nonnegative().default(0),
    modelCalls: z.number().int().nonnegative().default(0),
    toolCalls: z.number().int().nonnegative().default(0),
    subagentCalls: z.number().int().nonnegative().default(0),
    detail: RuntimeProgressDetailSchema.optional(),
    recentEvents: z.array(RuntimeProgressRecentEventSchema).default([])
  })
  .strict();
export type RuntimeProgressSnapshot = z.infer<typeof RuntimeProgressSnapshotSchema>;

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

export const RuntimeTerminalErrorSchema = z.enum([
  "MODEL_ERROR",
  "TOOL_ERROR",
  "POLICY_DENY",
  "APPROVAL_TIMEOUT",
  "EXECUTION_TIMEOUT",
  "STEP_BUDGET_EXHAUSTED",
  "EVENT_REPLAY_GAP",
  "EXECUTION_ABORTED",
  "EXECUTION_INTERRUPTED",
  "EMPTY_MODEL_RESPONSE"
]);
export type RuntimeTerminalError = z.infer<typeof RuntimeTerminalErrorSchema>;

export const SessionEventSchema = z.object({
  durability: z.literal("durable"),
  eventId: z.string(),
  executionId: z.string(),
  conversationId: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  traceId: z.string(),
  requestId: z.string(),
  createdAt: z.number(),
  kind: RuntimeEventKindSchema,
  data: z.record(z.unknown())
}).strict();
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const PreviewDeltaEventSchema = z.object({
  durability: z.literal("transient"),
  kind: z.literal("preview_delta"),
  previewSeq: z.number().int().positive(),
  executionId: z.string(),
  conversationId: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  traceId: z.string(),
  requestId: z.string(),
  createdAt: z.number(),
  data: z.record(z.unknown())
}).strict();
export type PreviewDeltaEvent = z.infer<typeof PreviewDeltaEventSchema>;

export const SSEWireEventSchema = z.discriminatedUnion("durability", [
  SessionEventSchema,
  PreviewDeltaEventSchema
]);
export type SSEWireEvent = z.infer<typeof SSEWireEventSchema>;
