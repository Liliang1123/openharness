import type { SSEEvent } from "./api";

interface TraceTreePanelProps {
  events: SSEEvent[];
}

interface TraceNode {
  id: string;
  parentId?: string;
  childConversationId?: string;
  skillName?: string;
  status?: string;
  terminalClass?: string;
  durationMs?: number;
  costUsdMicros?: number;
}

export function TraceTreePanel({ events }: TraceTreePanelProps) {
  const nodes = buildTraceNodes(events);
  if (nodes.length === 0) {
    return (
      <>
        <h2>SSE Events</h2>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </>
    );
  }

  const roots = nodes.filter((node) => !node.parentId);
  const children = nodes.filter((node) => node.parentId);

  return (
    <section className="trace-tree" aria-label="Trace Tree">
      <h2>Trace Tree</h2>
      {roots.map((root) => (
        <div className="trace-node root" key={root.id}>
          <strong>{root.id}</strong>
          {root.status && <span>status: {root.status}</span>}
          <div className="trace-children">
            {children
              .filter((child) => child.parentId === root.id)
              .map((child) => (
                <div className="trace-node child" key={child.id}>
                  <strong>{child.skillName ?? "subagent"}</strong>
                  <span>{child.id}</span>
                  {child.childConversationId && <span>{child.childConversationId}</span>}
                  {child.status && <span>status: {child.status}</span>}
                  {child.durationMs !== undefined && <span>duration: {child.durationMs} ms</span>}
                  {child.costUsdMicros !== undefined && <span>cost: {child.costUsdMicros} µUSD</span>}
                  {child.terminalClass && <span>terminal: {child.terminalClass}</span>}
                </div>
              ))}
          </div>
        </div>
      ))}
      <details>
        <summary>Raw events</summary>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </details>
    </section>
  );
}

function buildTraceNodes(events: SSEEvent[]): TraceNode[] {
  const roots = new Map<string, TraceNode>();
  const children = new Map<string, TraceNode>();

  for (const event of events) {
    const attrs = readAttributes(event.data);
    if (!attrs) continue;

    const nodeKind = stringValue(attrs.traceNodeKind);
    const executionId = stringValue(attrs.executionId);
    const parentExecutionId = stringValue(attrs.parentExecutionId) ?? executionId;
    const childExecutionId = stringValue(attrs.childExecutionId);

    if (nodeKind === "agent_execution" && executionId) {
      roots.set(executionId, mergeNode(roots.get(executionId), {
        id: executionId,
        status: stringValue(event.data.status)
      }));
      continue;
    }

    if (nodeKind !== "subagent_execution" || !parentExecutionId || !childExecutionId) continue;

    if (!roots.has(parentExecutionId)) roots.set(parentExecutionId, { id: parentExecutionId });
    children.set(childExecutionId, mergeNode(children.get(childExecutionId), {
      id: childExecutionId,
      parentId: parentExecutionId,
      childConversationId: stringValue(attrs.childConversationId),
      skillName: stringValue(attrs.skillName),
      status: stringValue(event.data.status),
      terminalClass: stringValue(attrs.terminalClass),
      durationMs: numberValue(attrs.durationMs ?? event.data.durationMs),
      costUsdMicros: numberValue(attrs.costUsdMicros ?? event.data.costUsdMicros)
    }));
  }

  return [...roots.values(), ...children.values()];
}

function mergeNode(previous: TraceNode | undefined, next: TraceNode): TraceNode {
  if (!previous) return next;
  return Object.fromEntries(
    Object.entries({ ...previous, ...next }).filter(([, value]) => value !== undefined)
  ) as unknown as TraceNode;
}

function readAttributes(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const attributes = data.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return undefined;
  return attributes as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
