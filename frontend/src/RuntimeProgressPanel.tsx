import type { RuntimeProgressSnapshot } from "./api";

interface RuntimeProgressPanelProps {
  progress: RuntimeProgressSnapshot | null;
}

export function RuntimeProgressPanel({ progress }: RuntimeProgressPanelProps) {
  if (!progress) {
    return (
      <section className="runtime-progress" aria-label="Runtime Progress">
        <h2>Runtime Progress</h2>
        <span className="progress-muted">No active execution</span>
      </section>
    );
  }

  return (
    <section className={`runtime-progress ${progress.status}`} aria-label="Runtime Progress">
      <div className="progress-header">
        <h2>Runtime Progress</h2>
        <span className="progress-pill">{label(progress.status)}</span>
      </div>
      <div className="progress-grid">
        <span>Execution</span>
        <strong>{progress.executionId}</strong>
        <span>Activity</span>
        <strong>{activityLabel(progress.currentActivity)}</strong>
        <span>Step</span>
        <strong>{progress.currentStep ? `Step ${progress.currentStep}` : "No step"}</strong>
        <span>Elapsed</span>
        <strong>{formatElapsed(progress.elapsedMs)}</strong>
        <span>Model calls</span>
        <strong>{progress.modelCalls}</strong>
        <span>Tool calls</span>
        <strong>{progress.toolCalls}</strong>
        <span>Subagents</span>
        <strong>{progress.subagentCalls}</strong>
        {progress.detail?.toolName && (
          <>
            <span>Tool</span>
            <strong>{progress.detail.toolName}</strong>
          </>
        )}
        {progress.detail?.toolCallId && (
          <>
            <span>Tool call</span>
            <strong>{progress.detail.toolCallId}</strong>
          </>
        )}
        {progress.detail?.skillName && (
          <>
            <span>Skill</span>
            <strong>{progress.detail.skillName}</strong>
          </>
        )}
        {progress.detail?.terminalClass && (
          <>
            <span>Terminal</span>
            <strong>{progress.detail.terminalClass}</strong>
          </>
        )}
      </div>
    </section>
  );
}

function label(status: RuntimeProgressSnapshot["status"]): string {
  const labels: Record<RuntimeProgressSnapshot["status"], string> = {
    running: "Running",
    waiting_approval: "Waiting approval",
    completed: "Completed",
    aborted: "Aborted",
    errored: "Errored"
  };
  return labels[status];
}

function activityLabel(activity: RuntimeProgressSnapshot["currentActivity"]): string {
  const labels: Record<RuntimeProgressSnapshot["currentActivity"], string> = {
    idle: "Idle",
    model_call: "Model call",
    tool_call: "Tool call",
    subagent: "Subagent",
    waiting_approval: "Waiting approval",
    terminal: "Terminal"
  };
  return labels[activity];
}

function formatElapsed(elapsedMs: number | undefined): string {
  if (elapsedMs === undefined) return "Unknown";
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}
