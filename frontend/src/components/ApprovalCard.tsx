import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import type { Approval } from "../lib/api";
import { approvals as approvalsApi } from "../lib/api";
import { useState } from "react";

interface Props {
  approval:  Approval;
  onReviewed: (updated: Approval) => void;
}

const ACTION_COLORS: Record<string, string> = {
  tool_call: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  publish:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  delete:    "bg-red-500/10  text-red-400  border-red-500/30",
  escalate:  "bg-violet-500/10 text-violet-400 border-violet-500/30",
};
const DEFAULT_ACTION = "bg-slate-500/10 text-slate-400 border-slate-500/30";

const STATUS_ICON = {
  pending:  <Clock size={13} className="text-amber-400" />,
  approved: <CheckCircle size={13} className="text-emerald-400" />,
  rejected: <XCircle size={13} className="text-red-400" />,
  expired:  <AlertTriangle size={13} className="text-slate-400" />,
};

export default function ApprovalCard({ approval, onReviewed }: Props) {
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);
  const [note, setNote]       = useState("");

  const handle = async (decision: "approved" | "rejected") => {
    setLoading(decision);
    try {
      const updated = await approvalsApi.review(approval.id, decision, note || undefined);
      onReviewed(updated);
    } finally {
      setLoading(null);
    }
  };

  const actionColor = ACTION_COLORS[approval.action_type] ?? DEFAULT_ACTION;
  const isPending   = approval.status === "pending";

  return (
    <div className={`card border p-4 flex flex-col gap-3 ${!isPending ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${actionColor}`}>
            {approval.action_type}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            #{approval.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
          {STATUS_ICON[approval.status]}
          {approval.status}
        </div>
      </div>

      {/* Payload preview */}
      <pre className="text-xs text-slate-300 bg-surface-900 rounded-lg px-3 py-2 overflow-x-auto max-h-32 font-mono border border-white/5">
        {JSON.stringify(approval.payload, null, 2)}
      </pre>

      {/* Meta */}
      <div className="text-xs text-slate-500 flex gap-3 flex-wrap">
        <span>Proposed: {new Date(approval.created_at).toLocaleString()}</span>
        {approval.expires_at && (
          <span className="text-amber-500/80">
            Expires: {new Date(approval.expires_at).toLocaleString()}
          </span>
        )}
      </div>

      {/* Review panel */}
      {isPending && (
        <div className="flex flex-col gap-2 pt-1 border-t border-white/8">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional review note…"
            className="input text-xs"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handle("approved")}
              disabled={!!loading}
              className="btn-primary flex-1 justify-center text-xs"
            >
              {loading === "approved"
                ? <span className="animate-pulse">Approving…</span>
                : <><CheckCircle size={13} /> Approve</>}
            </button>
            <button
              onClick={() => handle("rejected")}
              disabled={!!loading}
              className="btn-danger flex-1 justify-center text-xs"
            >
              {loading === "rejected"
                ? <span className="animate-pulse">Rejecting…</span>
                : <><XCircle size={13} /> Reject</>}
            </button>
          </div>
        </div>
      )}

      {/* Review result */}
      {!isPending && approval.review_note && (
        <p className="text-xs text-slate-400 italic border-t border-white/8 pt-2">
          "{approval.review_note}"
        </p>
      )}
    </div>
  );
}
