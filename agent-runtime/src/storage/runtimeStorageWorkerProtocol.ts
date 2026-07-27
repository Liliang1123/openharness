import { isAbsolute } from "node:path";
import {
  AgentMessageSchema,
  MemoryFactSchema,
  SessionEventSchema
} from "@openharness/shared-schema";
import type { PendingApproval } from "../approvalStore";
import type { SessionMeta } from "../history";
import type { MemoryFact, MemoryFactInput } from "../memoryStore";
import type { EventId, SessionEvent } from "../types";
import type {
  AbortExecutionInput,
  CompleteExecutionInput,
  CompleteToolInput,
  DecideApprovalInput,
  EnterApprovalInput,
  FailExecutionInput,
  InterruptExecutionInput,
  LifecycleCommit,
  RecordInjectedMessagesInput,
  RecordRuntimeEventInput,
  RecordToolPlanInput,
  StartExecutionInput
} from "./lifecycleCommands";
import type { ReconcileRuntimeStartupResult } from "./reconcile";
import type { RuntimeDatabaseIdentity } from "./runtimeStorage";
import type { SqliteExecutionRecord } from "./sqliteExecutionStore";

export type StoragePriority = "p0" | "p1" | "p2";

export interface TraceOutboxCandidate {
  event: SessionEvent;
  deliveryAttempts: number;
  nextAttemptAt: number | null;
}

export type TraceOutboxTransition =
  | {
      event: Pick<SessionEvent, "tenantId" | "userId" | "conversationId" | "eventId">;
      transition: "delivered" | "dead_letter";
    }
  | {
      event: Pick<SessionEvent, "tenantId" | "userId" | "conversationId" | "eventId">;
      transition: "retry";
      nextAttemptAt: number;
    };

export interface TraceOutboxTransitionResult {
  processed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  readinessDegraded: boolean;
}

export interface StoragePayloadMap {
  bootstrap: {
    databasePath: string;
    expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
  };
  "lifecycle.startExecution": StartExecutionInput;
  "lifecycle.enterApproval": EnterApprovalInput;
  "lifecycle.decideApproval": DecideApprovalInput;
  "lifecycle.recordToolPlan": RecordToolPlanInput;
  "lifecycle.completeTool": CompleteToolInput;
  "lifecycle.completeExecution": CompleteExecutionInput;
  "lifecycle.failExecution": FailExecutionInput;
  "lifecycle.abortExecution": AbortExecutionInput;
  "lifecycle.recordEvent": RecordRuntimeEventInput;
  "lifecycle.recordInjectedMessages": RecordInjectedMessagesInput;
  "lifecycle.interruptExecution": InterruptExecutionInput;
  "history.get": {
    tenantId: string;
    userId: string;
    conversationId: string;
  };
  "history.append": StoragePayloadMap["history.get"] & {
    message: unknown;
  };
  "history.replace": StoragePayloadMap["history.get"] & {
    messages: unknown[];
  };
  "history.list": {
    tenantId: string;
    userId: string;
  };
  "history.delete": StoragePayloadMap["history.get"];
  "memory.upsert": {
    fact: MemoryFactInput;
  };
  "memory.list": {
    tenantId: string;
    userId: string;
  };
  "memory.search": StoragePayloadMap["memory.list"] & {
    query: string;
    tags?: string[];
  };
  "memory.delete": StoragePayloadMap["memory.list"] & {
    memoryId: string;
  };
  "execution.get": StoragePayloadMap["history.get"] & {
    executionId: string;
  };
  "execution.getActive": StoragePayloadMap["history.get"];
  "execution.listNonTerminal": Record<string, never>;
  "approval.get": StoragePayloadMap["execution.get"] & {
    toolCallId: string;
  };
  "approval.listPending": StoragePayloadMap["history.get"];
  "event.since": StoragePayloadMap["history.get"] & {
    afterEventId: EventId | null;
  };
  "event.forExecution": StoragePayloadMap["history.get"] & {
    executionId?: string;
  };
  "event.latestEventId": StoragePayloadMap["history.get"];
  "event.hasEvent": StoragePayloadMap["history.get"] & {
    eventId: EventId;
  };
  "outbox.claim": {
    now: number;
    limit: number;
  };
  "outbox.applyOutcomes": {
    outcomes: TraceOutboxTransition[];
  };
  "outbox.hasDeadLetters": Record<string, never>;
  "storage.checkpoint": Record<string, never>;
  "storage.criticalDrain": {
    errorMessage: string;
  };
  "storage.close": Record<string, never>;
}

export interface StorageResultMap {
  bootstrap: {
    schemaVersion: number;
    integrity: "ok";
    databaseIdentity: RuntimeDatabaseIdentity;
    reconciliation: ReconcileRuntimeStartupResult;
  };
  "lifecycle.startExecution": LifecycleCommit;
  "lifecycle.enterApproval": LifecycleCommit;
  "lifecycle.decideApproval": LifecycleCommit;
  "lifecycle.recordToolPlan": LifecycleCommit;
  "lifecycle.completeTool": LifecycleCommit;
  "lifecycle.completeExecution": LifecycleCommit;
  "lifecycle.failExecution": LifecycleCommit;
  "lifecycle.abortExecution": LifecycleCommit;
  "lifecycle.recordEvent": LifecycleCommit;
  "lifecycle.recordInjectedMessages": LifecycleCommit;
  "lifecycle.interruptExecution": LifecycleCommit;
  "history.get": unknown[];
  "history.append": undefined;
  "history.replace": undefined;
  "history.list": SessionMeta[];
  "history.delete": undefined;
  "memory.upsert": MemoryFact;
  "memory.list": MemoryFact[];
  "memory.search": MemoryFact[];
  "memory.delete": boolean;
  "execution.get": SqliteExecutionRecord | null;
  "execution.getActive": SqliteExecutionRecord | null;
  "execution.listNonTerminal": SqliteExecutionRecord[];
  "approval.get": PendingApproval | null;
  "approval.listPending": PendingApproval[];
  "event.since": SessionEvent[];
  "event.forExecution": SessionEvent[];
  "event.latestEventId": EventId | null;
  "event.hasEvent": boolean;
  "outbox.claim": TraceOutboxCandidate[];
  "outbox.applyOutcomes": TraceOutboxTransitionResult;
  "outbox.hasDeadLetters": boolean;
  "storage.checkpoint": {
    busy: number;
    log: number;
    checkpointed: number;
  };
  "storage.criticalDrain": {
    interruptedExecutions: number;
    events: SessionEvent[];
  };
  "storage.close": undefined;
}

export type StorageOperation = keyof StoragePayloadMap;

export type StorageWorkerRequest<
  O extends StorageOperation = StorageOperation
> = O extends StorageOperation
  ? {
      requestId: string;
      priority: StoragePriority;
      operation: O;
      payload: StoragePayloadMap[O];
    }
  : never;

export interface StorageWorkerSuccess {
  requestId: string;
  ok: true;
  result: unknown;
}

export interface StorageWorkerFailure {
  requestId: string;
  ok: false;
  error: {
    code: string;
    errorClass: string;
  };
}

export type StorageWorkerResponse = StorageWorkerSuccess | StorageWorkerFailure;

const OPERATIONS = new Set<StorageOperation>([
  "bootstrap",
  "lifecycle.startExecution",
  "lifecycle.enterApproval",
  "lifecycle.decideApproval",
  "lifecycle.recordToolPlan",
  "lifecycle.completeTool",
  "lifecycle.completeExecution",
  "lifecycle.failExecution",
  "lifecycle.abortExecution",
  "lifecycle.recordEvent",
  "lifecycle.recordInjectedMessages",
  "lifecycle.interruptExecution",
  "history.get",
  "history.append",
  "history.replace",
  "history.list",
  "history.delete",
  "memory.upsert",
  "memory.list",
  "memory.search",
  "memory.delete",
  "execution.get",
  "execution.getActive",
  "execution.listNonTerminal",
  "approval.get",
  "approval.listPending",
  "event.since",
  "event.forExecution",
  "event.latestEventId",
  "event.hasEvent",
  "outbox.claim",
  "outbox.applyOutcomes",
  "outbox.hasDeadLetters",
  "storage.checkpoint",
  "storage.criticalDrain",
  "storage.close"
]);

const PRIORITIES = new Set<StoragePriority>(["p0", "p1", "p2"]);
const SAFE_ERROR_CODE = /^[A-Z0-9_]+$/;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "callback",
  "execute",
  "function",
  "rawSql",
  "sql",
  "transaction"
]);

export function parseStorageWorkerRequest(value: unknown): StorageWorkerRequest {
  if (!isPlainObject(value) || !hasOnlyKeys(
    value,
    ["requestId", "priority", "operation", "payload"]
  )) {
    throw new Error("invalid_storage_worker_request");
  }
  if (
    !nonEmptyString(value.requestId)
    || !PRIORITIES.has(value.priority as StoragePriority)
    || !OPERATIONS.has(value.operation as StorageOperation)
    || !isPlainObject(value.payload)
    || !isStructuredCloneSafe(value.payload)
    || containsForbiddenKey(value.payload)
  ) {
    throw new Error("invalid_storage_worker_request");
  }

  const operation = value.operation as StorageOperation;
  if (!validPayload(operation, value.payload)) {
    throw new Error("invalid_storage_worker_request");
  }
  return value as StorageWorkerRequest;
}

export function parseStorageWorkerResponse(value: unknown): StorageWorkerResponse {
  if (!isPlainObject(value) || !nonEmptyString(value.requestId)) {
    throw new Error("invalid_storage_worker_response");
  }
  if (value.ok === true) {
    if (
      !hasOnlyKeys(value, ["requestId", "ok", "result"])
      || !isStructuredCloneSafe(value.result)
    ) {
      throw new Error("invalid_storage_worker_response");
    }
    return value as unknown as StorageWorkerSuccess;
  }
  if (
    value.ok !== false
    || !hasOnlyKeys(value, ["requestId", "ok", "error"])
    || !isPlainObject(value.error)
    || !hasOnlyKeys(value.error, ["code", "errorClass"])
    || typeof value.error.code !== "string"
    || !SAFE_ERROR_CODE.test(value.error.code)
    || !nonEmptyString(value.error.errorClass)
  ) {
    throw new Error("invalid_storage_worker_response");
  }
  return value as unknown as StorageWorkerFailure;
}

export function isStorageWorkerResult(
  operation: StorageOperation,
  result: unknown
): boolean {
  if (operation === "bootstrap") {
    return isPlainObject(result)
      && nonNegativeInteger(result.schemaVersion)
      && result.integrity === "ok"
      && isDatabaseIdentity(result.databaseIdentity)
      && isPlainObject(result.reconciliation)
      && nonNegativeInteger(result.reconciliation.interruptedExecutions)
      && nonNegativeInteger(result.reconciliation.invalidatedApprovals);
  }
  if (operation.startsWith("lifecycle.")) {
    return lifecycleCommit(result);
  }
  if (
    operation === "history.append"
    || operation === "history.replace"
    || operation === "history.delete"
    || operation === "storage.close"
  ) {
    return result === undefined;
  }
  if (operation === "history.get") {
    return Array.isArray(result)
      && result.every(item => AgentMessageSchema.safeParse(item).success);
  }
  if (operation === "history.list") {
    return Array.isArray(result) && result.every(sessionMeta);
  }
  if (operation === "memory.upsert") {
    return MemoryFactSchema.safeParse(result).success;
  }
  if (operation === "memory.list" || operation === "memory.search") {
    return Array.isArray(result)
      && result.every(item => MemoryFactSchema.safeParse(item).success);
  }
  if (
    operation === "memory.delete"
    || operation === "event.hasEvent"
    || operation === "outbox.hasDeadLetters"
  ) {
    return typeof result === "boolean";
  }
  if (operation === "execution.get" || operation === "execution.getActive") {
    return result === null || executionRecord(result);
  }
  if (operation === "execution.listNonTerminal") {
    return Array.isArray(result) && result.every(executionRecord);
  }
  if (operation === "approval.get") {
    return result === null || pendingApproval(result);
  }
  if (operation === "approval.listPending") {
    return Array.isArray(result) && result.every(pendingApproval);
  }
  if (
    operation === "event.since"
    || operation === "event.forExecution"
  ) {
    return Array.isArray(result)
      && result.every(item => SessionEventSchema.safeParse(item).success);
  }
  if (operation === "event.latestEventId") {
    return result === null || nonEmptyString(result);
  }
  if (operation === "outbox.claim") {
    return Array.isArray(result) && result.every(outboxCandidate);
  }
  if (operation === "outbox.applyOutcomes") {
    return isPlainObject(result)
      && nonNegativeInteger(result.processed)
      && nonNegativeInteger(result.delivered)
      && nonNegativeInteger(result.retried)
      && nonNegativeInteger(result.deadLettered)
      && typeof result.readinessDegraded === "boolean";
  }
  if (operation === "storage.checkpoint") {
    return isPlainObject(result)
      && nonNegativeInteger(result.busy)
      && nonNegativeInteger(result.log)
      && nonNegativeInteger(result.checkpointed);
  }
  if (operation === "storage.criticalDrain") {
    return isPlainObject(result)
      && nonNegativeInteger(result.interruptedExecutions)
      && Array.isArray(result.events)
      && result.events.every(item => SessionEventSchema.safeParse(item).success);
  }
  return false;
}

function validPayload(operation: StorageOperation, payload: Record<string, unknown>): boolean {
  if (!hasAllowedPayloadKeys(operation, payload)) return false;
  if (operation === "bootstrap") {
    return nonEmptyString(payload.databasePath)
      && isAbsolute(payload.databasePath)
      && (
        payload.expectedDatabaseIdentity === undefined
        || isDatabaseIdentity(payload.expectedDatabaseIdentity)
      );
  }
  if (operation.startsWith("lifecycle.")) {
    return validLifecyclePayload(
      operation as Extract<StorageOperation, `lifecycle.${string}`>,
      payload
    );
  }
  if (operation === "outbox.applyOutcomes") {
    return Array.isArray(payload.outcomes)
      && payload.outcomes.every(validOutboxTransition);
  }
  if (operation === "outbox.claim") {
    return finiteNumber(payload.now)
      && positiveInteger(payload.limit);
  }
  if (
    operation === "execution.listNonTerminal"
    || operation === "outbox.hasDeadLetters"
    || operation === "storage.checkpoint"
    || operation === "storage.close"
  ) {
    return Object.keys(payload).length === 0;
  }
  if (operation === "storage.criticalDrain") {
    return nonEmptyString(payload.errorMessage);
  }
  if (operation === "history.get" || operation === "history.delete") {
    return historyScope(payload);
  }
  if (operation === "history.append") {
    return historyScope(payload) && agentMessage(payload.message);
  }
  if (operation === "history.replace") {
    return historyScope(payload)
      && Array.isArray(payload.messages)
      && payload.messages.every(agentMessage);
  }
  if (operation === "history.list" || operation === "memory.list") {
    return ownerScope(payload);
  }
  if (operation === "memory.upsert") {
    return isPlainObject(payload.fact)
      && ownerScope(payload.fact)
      && typeof payload.fact.content === "string"
      && optionalStringArray(payload.fact.tags);
  }
  if (operation === "memory.search") {
    return ownerScope(payload)
      && typeof payload.query === "string"
      && optionalStringArray(payload.tags);
  }
  if (operation === "memory.delete") {
    return ownerScope(payload) && nonEmptyString(payload.memoryId);
  }
  if (operation === "execution.get") {
    return historyScope(payload) && nonEmptyString(payload.executionId);
  }
  if (operation === "execution.getActive" || operation === "approval.listPending") {
    return historyScope(payload);
  }
  if (operation === "approval.get") {
    return historyScope(payload)
      && nonEmptyString(payload.executionId)
      && nonEmptyString(payload.toolCallId);
  }
  if (operation === "event.since") {
    return historyScope(payload)
      && (payload.afterEventId === null || nonEmptyString(payload.afterEventId));
  }
  if (operation === "event.forExecution") {
    return historyScope(payload)
      && (payload.executionId === undefined || nonEmptyString(payload.executionId));
  }
  if (operation === "event.latestEventId") {
    return historyScope(payload);
  }
  if (operation === "event.hasEvent") {
    return historyScope(payload) && nonEmptyString(payload.eventId);
  }
  return false;
}

function validLifecyclePayload(
  operation: Extract<StorageOperation, `lifecycle.${string}`>,
  payload: Record<string, unknown>
): boolean {
  if (!lifecycleScope(payload)) return false;
  switch (operation) {
    case "lifecycle.startExecution":
      return typeof payload.message === "string";
    case "lifecycle.enterApproval":
      return nonEmptyString(payload.approvalId)
        && nonEmptyString(payload.toolCallId)
        && nonEmptyString(payload.toolName)
        && typeof payload.argumentsRaw === "string"
        && (payload.reason === undefined || typeof payload.reason === "string");
    case "lifecycle.decideApproval":
      return nonEmptyString(payload.approvalId)
        && ["approved", "rejected", "revised"].includes(String(payload.nextStatus));
    case "lifecycle.recordToolPlan":
      return agentMessage(payload.assistantMessage) && nonNegativeInteger(payload.stepIndex);
    case "lifecycle.completeTool":
      return agentMessage(payload.toolResult)
        && nonNegativeInteger(payload.stepIndex)
        && (
          payload.status === undefined
          || payload.status === "ok"
          || payload.status === "rejected"
        );
    case "lifecycle.completeExecution":
      return agentMessage(payload.assistantMessage)
        && nonEmptyString(payload.stopReason)
        && (payload.usage === undefined || isPlainObject(payload.usage));
    case "lifecycle.failExecution":
      return nonEmptyString(payload.errorClass)
        && typeof payload.errorMessage === "string"
        && (payload.details === undefined || isPlainObject(payload.details));
    case "lifecycle.abortExecution":
    case "lifecycle.interruptExecution":
      return typeof payload.errorMessage === "string";
    case "lifecycle.recordEvent":
      return nonEmptyString(payload.kind) && isPlainObject(payload.data);
    case "lifecycle.recordInjectedMessages":
      return Array.isArray(payload.messages) && payload.messages.every(agentMessage);
  }
}

function hasAllowedPayloadKeys(
  operation: StorageOperation,
  payload: Record<string, unknown>
): boolean {
  const scope = [
    "tenantId",
    "userId",
    "conversationId",
    "executionId",
    "traceId",
    "requestId"
  ];
  const lifecycleKeys: Partial<Record<StorageOperation, string[]>> = {
    "lifecycle.startExecution": ["message"],
    "lifecycle.enterApproval": [
      "approvalId",
      "toolCallId",
      "toolName",
      "argumentsRaw",
      "reason"
    ],
    "lifecycle.decideApproval": ["approvalId", "nextStatus"],
    "lifecycle.recordToolPlan": ["assistantMessage", "stepIndex"],
    "lifecycle.completeTool": ["toolResult", "stepIndex", "status"],
    "lifecycle.completeExecution": ["assistantMessage", "stopReason", "usage"],
    "lifecycle.failExecution": ["errorClass", "errorMessage", "details"],
    "lifecycle.abortExecution": ["errorMessage"],
    "lifecycle.recordEvent": ["kind", "data"],
    "lifecycle.recordInjectedMessages": ["messages"],
    "lifecycle.interruptExecution": ["errorMessage"]
  };
  const lifecycle = lifecycleKeys[operation];
  if (lifecycle) {
    return hasOnlyAllowedKeys(payload, [...scope, "crash", ...lifecycle]);
  }

  const keys: Record<Exclude<StorageOperation, `lifecycle.${string}`>, string[]> = {
    bootstrap: ["databasePath", "expectedDatabaseIdentity"],
    "history.get": ["tenantId", "userId", "conversationId"],
    "history.append": ["tenantId", "userId", "conversationId", "message"],
    "history.replace": ["tenantId", "userId", "conversationId", "messages"],
    "history.list": ["tenantId", "userId"],
    "history.delete": ["tenantId", "userId", "conversationId"],
    "memory.upsert": ["fact"],
    "memory.list": ["tenantId", "userId"],
    "memory.search": ["tenantId", "userId", "query", "tags"],
    "memory.delete": ["tenantId", "userId", "memoryId"],
    "execution.get": ["tenantId", "userId", "conversationId", "executionId"],
    "execution.getActive": ["tenantId", "userId", "conversationId"],
    "execution.listNonTerminal": [],
    "approval.get": [
      "tenantId",
      "userId",
      "conversationId",
      "executionId",
      "toolCallId"
    ],
    "approval.listPending": ["tenantId", "userId", "conversationId"],
    "event.since": ["tenantId", "userId", "conversationId", "afterEventId"],
    "event.forExecution": [
      "tenantId",
      "userId",
      "conversationId",
      "executionId"
    ],
    "event.latestEventId": ["tenantId", "userId", "conversationId"],
    "event.hasEvent": ["tenantId", "userId", "conversationId", "eventId"],
    "outbox.claim": ["now", "limit"],
    "outbox.applyOutcomes": ["outcomes"],
    "outbox.hasDeadLetters": [],
    "storage.checkpoint": [],
    "storage.criticalDrain": ["errorMessage"],
    "storage.close": []
  };
  return hasOnlyAllowedKeys(
    payload,
    keys[operation as Exclude<StorageOperation, `lifecycle.${string}`>]
  );
}

function validOutboxTransition(value: unknown): boolean {
  if (!isPlainObject(value) || !isPlainObject(value.event)) return false;
  if (
    !hasOnlyAllowedKeys(value, ["event", "transition", "nextAttemptAt"])
    || !hasOnlyAllowedKeys(
      value.event,
      ["tenantId", "userId", "conversationId", "eventId"]
    )
  ) {
    return false;
  }
  if (
    !historyScope(value.event)
    || !nonEmptyString(value.event.eventId)
  ) {
    return false;
  }
  if (value.transition === "retry") return finiteNumber(value.nextAttemptAt);
  return (
    value.nextAttemptAt === undefined
    && (value.transition === "delivered" || value.transition === "dead_letter")
  );
}

function lifecycleCommit(value: unknown): boolean {
  return isPlainObject(value)
    && hasOnlyAllowedKeys(value, ["events"])
    && Array.isArray(value.events)
    && value.events.every(item => SessionEventSchema.safeParse(item).success);
}

function sessionMeta(value: unknown): boolean {
  return isPlainObject(value)
    && nonEmptyString(value.conversationId)
    && typeof value.title === "string"
    && nonEmptyString(value.updatedAt);
}

function executionRecord(value: unknown): boolean {
  return isPlainObject(value)
    && nonEmptyString(value.executionId)
    && historyScope(value)
    && ["running", "waiting_approval", "completed", "aborted", "errored"]
      .includes(String(value.status))
    && (value.stopReason === null || typeof value.stopReason === "string")
    && finiteNumber(value.createdAt)
    && finiteNumber(value.updatedAt);
}

function pendingApproval(value: unknown): boolean {
  return isPlainObject(value)
    && nonEmptyString(value.askUserId)
    && historyScope(value)
    && nonEmptyString(value.executionId)
    && nonEmptyString(value.toolCallId)
    && nonEmptyString(value.toolName)
    && typeof value.argumentsRaw === "string"
    && nonEmptyString(value.createdAt);
}

function outboxCandidate(value: unknown): boolean {
  return isPlainObject(value)
    && SessionEventSchema.safeParse(value.event).success
    && nonNegativeInteger(value.deliveryAttempts)
    && (value.nextAttemptAt === null || finiteNumber(value.nextAttemptAt));
}

function agentMessage(value: unknown): boolean {
  return isPlainObject(value)
    && ["system", "user", "assistant", "tool"].includes(String(value.role))
    && Object.hasOwn(value, "content");
}

function ownerScope(value: Record<string, unknown>): boolean {
  return nonEmptyString(value.tenantId) && nonEmptyString(value.userId);
}

function historyScope(value: Record<string, unknown>): boolean {
  return ownerScope(value) && nonEmptyString(value.conversationId);
}

function optionalStringArray(value: unknown): boolean {
  return value === undefined
    || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function lifecycleScope(value: Record<string, unknown>): boolean {
  return nonEmptyString(value.tenantId)
    && nonEmptyString(value.userId)
    && nonEmptyString(value.conversationId)
    && nonEmptyString(value.executionId)
    && nonEmptyString(value.traceId)
    && nonEmptyString(value.requestId)
    && (
      value.crash === undefined
      || value.crash === "before_commit"
      || value.crash === "after_commit"
    );
}

function isDatabaseIdentity(value: unknown): value is RuntimeDatabaseIdentity {
  return isPlainObject(value)
    && hasOnlyKeys(value, ["dev", "ino"])
    && nonNegativeInteger(value.dev)
    && nonNegativeInteger(value.ino);
}

function isStructuredCloneSafe(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || typeof value === "undefined"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.every(item => isStructuredCloneSafe(item, seen));
  }
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(item => isStructuredCloneSafe(item, seen));
}

function containsForbiddenKey(
  value: Record<string, unknown>,
  seen = new Set<object>()
): boolean {
  if (seen.has(value)) return true;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) return true;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isPlainObject(item) && containsForbiddenKey(item, seen)) return true;
      }
    } else if (isPlainObject(child) && containsForbiddenKey(child, seen)) {
      return true;
    }
  }
  return false;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key))
    && keys.every(key => key === "result" || Object.hasOwn(value, key));
}

function hasOnlyAllowedKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
