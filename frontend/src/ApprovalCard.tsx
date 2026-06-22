import { useState } from "react";
import { replyApproval, replyAskUser } from "./api";

interface ApprovalCardProps {
  askUserId: string;
  conversationId?: string;
  executionId?: string;
  toolCallId?: string;
  toolName: string;
  reason?: string;
  onResolved: (action: "approve" | "reject") => void;
}

export function ApprovalCard({ askUserId, conversationId, executionId, toolCallId, toolName, reason, onResolved }: ApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);

  async function handle(action: "approve" | "reject") {
    setBusy(true);
    if (conversationId && executionId && toolCallId) {
      await replyApproval({ conversationId, executionId, toolCallId, action });
    } else {
      await replyAskUser(askUserId, action);
    }
    setResolved(action === "approve" ? "已批准" : "已拒绝");
    onResolved(action);
  }

  if (resolved) return <div className="approval-card resolved">{resolved}</div>;

  return (
    <div className="approval-card" role="alert" aria-label="Approval required">
      <p>⚠️ 工具 <strong>{toolName}</strong> 需要审批</p>
      {reason && <p className="reason">{reason}</p>}
      <button onClick={() => handle("approve")} disabled={busy}>Approve</button>
      <button onClick={() => handle("reject")} disabled={busy}>Reject</button>
    </div>
  );
}
