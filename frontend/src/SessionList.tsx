import type { SessionMeta } from "./api";

interface SessionListProps {
  sessions: SessionMeta[];
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
}

export function SessionList({ sessions, activeId, onSelect, onNew, onDelete }: SessionListProps) {
  return (
    <aside className="session-list" aria-label="Sessions">
      <div className="session-list-header">
        <h2>Sessions</h2>
        <button type="button" className="session-new" onClick={onNew}>+ New</button>
      </div>
      {sessions.length === 0 ? (
        <div className="session-empty">No sessions yet</div>
      ) : (
        <ul className="session-items">
          {sessions.map((s) => (
            <li
              key={s.conversationId}
              className={`session-item ${s.conversationId === activeId ? "active" : ""}`}
            >
              <button
                type="button"
                className="session-select"
                onClick={() => onSelect(s.conversationId)}
                title={s.conversationId}
              >
                <span className="session-title">{s.title}</span>
                <span className="session-time">{formatTime(s.updatedAt)}</span>
              </button>
              <button
                type="button"
                className="session-delete"
                aria-label={`Delete session ${s.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete session "${s.title}"?`)) {
                    onDelete(s.conversationId);
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
