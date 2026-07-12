import {
  ModelChatResponseSchema,
  ToolCancelResponseSchema,
  ToolCallResponseSchema,
  TraceEventSchema
} from "@openharness/shared-schema";
import type {
  CodexToolResultSubmission,
  CodexTurnCancelRequest
} from "@openharness/shared-schema";
import type {
  CatalogResponse,
  ModelChatRequest,
  ModelChatResponse,
  ToolCancelRequest,
  ToolCancelResponse,
  ToolCallRequest,
  ToolCallResponse,
  TraceEvent,
  AgentMessage
} from "./types";

export interface PolicyEvaluateRequest {
  requestId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  traceId: string;
  toolCalls: { id: string; name: string; argumentsRaw: string; source?: string }[];
  context: { catalogVersion: string; catalogHash: string; [key: string]: unknown };
}

export interface PolicyEvaluateResponse {
  requestId: string;
  conversationId: string;
  decisions: {
    toolCallId: string;
    decision: string;
    source?: string;
    reason?: string;
    approvalToken?: string;
  }[];
}

export class AmbiguousHttpResultError extends Error {
  constructor() {
    super("HTTP outcome is ambiguous");
    this.name = "AmbiguousHttpResultError";
  }
}

export interface JavaClient {
  getCatalog(headers: Record<string, string>): Promise<CatalogResponse>;
  chat(request: ModelChatRequest, headers: Record<string, string>): Promise<ModelChatResponse>;
  executeTool(request: ToolCallRequest, headers: Record<string, string>): Promise<ToolCallResponse>;
  cancelTool?(request: ToolCancelRequest, headers: Record<string, string>): Promise<ToolCancelResponse>;
  completeCodexToolCall?(
    bridgeId: string,
    request: CodexToolResultSubmission,
    headers: Record<string, string>
  ): Promise<ModelChatResponse>;
  cancelCodexTurn?(
    bridgeId: string,
    request: CodexTurnCancelRequest,
    headers: Record<string, string>
  ): Promise<ModelChatResponse>;
  postTrace(event: TraceEvent, headers: Record<string, string>): Promise<void>;
  evaluatePolicy(request: PolicyEvaluateRequest, headers: Record<string, string>): Promise<PolicyEvaluateResponse>;
  compress?(messages: AgentMessage[], headers: Record<string, string>): Promise<string>;
}

export class HttpJavaClient implements JavaClient {
  constructor(private readonly baseUrl: string) {}

  async getCatalog(headers: Record<string, string>): Promise<CatalogResponse> {
    return this.request<CatalogResponse>("/api/v1/tools/catalog", { method: "GET", headers });
  }

  async chat(request: ModelChatRequest, headers: Record<string, string>): Promise<ModelChatResponse> {
    const response = await this.request<unknown>("/api/v1/model/chat", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    return ModelChatResponseSchema.parse(response);
  }

  async executeTool(request: ToolCallRequest, headers: Record<string, string>): Promise<ToolCallResponse> {
    const response = await this.request<unknown>("/api/v1/tools/execute", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    return ToolCallResponseSchema.parse(response);
  }

  async cancelTool(request: ToolCancelRequest, headers: Record<string, string>): Promise<ToolCancelResponse> {
    const response = await this.request<unknown>("/api/v1/tools/cancel", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    return ToolCancelResponseSchema.parse(response);
  }

  async completeCodexToolCall(
    bridgeId: string,
    request: CodexToolResultSubmission,
    headers: Record<string, string>
  ): Promise<ModelChatResponse> {
    const response = await this.request<unknown>(
      `/api/v1/model/codex/turns/${encodeURIComponent(bridgeId)}/tool-result`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(request)
      },
      true
    );
    return ModelChatResponseSchema.parse(response);
  }

  async cancelCodexTurn(
    bridgeId: string,
    request: CodexTurnCancelRequest,
    headers: Record<string, string>
  ): Promise<ModelChatResponse> {
    const response = await this.request<unknown>(
      `/api/v1/model/codex/turns/${encodeURIComponent(bridgeId)}/cancel`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(request)
      }
    );
    return ModelChatResponseSchema.parse(response);
  }

  async postTrace(event: TraceEvent, headers: Record<string, string>): Promise<void> {
    TraceEventSchema.parse(event);
    await this.request<unknown>("/api/v1/trace/events", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
  }

  async evaluatePolicy(request: PolicyEvaluateRequest, headers: Record<string, string>): Promise<PolicyEvaluateResponse> {
    return this.request<PolicyEvaluateResponse>("/api/v1/policies/tool-review/evaluate", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async compress(messages: AgentMessage[], headers: Record<string, string>): Promise<string> {
    const response = await this.request<{ summary: string }>("/api/v1/model/compress", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    return response.summary;
  }

  private async request<T>(path: string, init: RequestInit, ambiguousOnNetworkFailure = false): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (failure) {
      if (ambiguousOnNetworkFailure) throw new AmbiguousHttpResultError();
      throw failure;
    }
    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      throw new Error(JSON.stringify(body));
    }
    return body as T;
  }
}
