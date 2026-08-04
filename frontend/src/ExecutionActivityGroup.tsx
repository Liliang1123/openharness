import { useEffect, useState } from "react";
import {
  isTerminalActivity,
  summarizeTools,
  type ExecutionActivity
} from "./executionActivity";

export function ExecutionActivityGroup({ activity }: { activity: ExecutionActivity | null }) {
  const terminal = activity ? isTerminalActivity(activity) : false;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(activity ? !isTerminalActivity(activity) : false);
  }, [activity?.executionId, terminal]);

  if (!activity) return null;

  const tools = summarizeTools(activity.tools);
  const outcome = activity.status === "completed"
    ? "执行完成"
    : activity.status === "aborted"
      ? "执行已中止"
      : activity.status === "errored"
        ? "执行失败"
        : "执行中";
  const safeError = [activity.terminalClass, activity.upstreamErrorClass]
    .filter(Boolean)
    .join(" · ");
  const summary = [outcome, tools, safeError].filter(Boolean).join("｜");

  return (
    <section
      className={`execution-activity ${activity.status}`}
      aria-label="Execution activity"
    >
      <button
        type="button"
        className="execution-activity-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{summary}</span>
        <span aria-hidden="true">{expanded ? "收起" : "展开"}</span>
      </button>
      {activity.modelActive && (
        <div className="execution-thinking">🤔 思考中...</div>
      )}
      {expanded && (
        <ol className="execution-activity-list">
          {activity.entries.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.kind === "model"
                  ? `模型调用 ${entry.stepIndex ?? ""}`.trim()
                  : entry.toolName ?? "unknown_tool"}
              </span>
              <span>{entry.status}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
