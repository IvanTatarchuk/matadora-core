import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { approvals as approvalsApi } from "../lib/api";
import { useState } from "react";
const ACTION_COLORS = {
    tool_call: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    publish: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    delete: "bg-red-500/10  text-red-400  border-red-500/30",
    escalate: "bg-violet-500/10 text-violet-400 border-violet-500/30",
};
const DEFAULT_ACTION = "bg-slate-500/10 text-slate-400 border-slate-500/30";
const STATUS_ICON = {
    pending: _jsx(Clock, { size: 13, className: "text-amber-400" }),
    approved: _jsx(CheckCircle, { size: 13, className: "text-emerald-400" }),
    rejected: _jsx(XCircle, { size: 13, className: "text-red-400" }),
    expired: _jsx(AlertTriangle, { size: 13, className: "text-slate-400" }),
};
export default function ApprovalCard({ approval, onReviewed }) {
    const [loading, setLoading] = useState(null);
    const [note, setNote] = useState("");
    const handle = async (decision) => {
        setLoading(decision);
        try {
            const updated = await approvalsApi.review(approval.id, decision, note || undefined);
            onReviewed(updated);
        }
        finally {
            setLoading(null);
        }
    };
    const actionColor = ACTION_COLORS[approval.action_type] ?? DEFAULT_ACTION;
    const isPending = approval.status === "pending";
    return (_jsxs("div", { className: `card border p-4 flex flex-col gap-3 ${!isPending ? "opacity-60" : ""}`, children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: `text-xs font-mono px-2 py-0.5 rounded border ${actionColor}`, children: approval.action_type }), _jsxs("span", { className: "text-xs text-slate-500 font-mono", children: ["#", approval.id.slice(0, 8)] })] }), _jsxs("div", { className: "flex items-center gap-1 text-xs text-slate-400 shrink-0", children: [STATUS_ICON[approval.status], approval.status] })] }), _jsx("pre", { className: "text-xs text-slate-300 bg-surface-900 rounded-lg px-3 py-2 overflow-x-auto max-h-32 font-mono border border-white/5", children: JSON.stringify(approval.payload, null, 2) }), _jsxs("div", { className: "text-xs text-slate-500 flex gap-3 flex-wrap", children: [_jsxs("span", { children: ["Proposed: ", new Date(approval.created_at).toLocaleString()] }), approval.expires_at && (_jsxs("span", { className: "text-amber-500/80", children: ["Expires: ", new Date(approval.expires_at).toLocaleString()] }))] }), isPending && (_jsxs("div", { className: "flex flex-col gap-2 pt-1 border-t border-white/8", children: [_jsx("input", { value: note, onChange: (e) => setNote(e.target.value), placeholder: "Optional review note\u2026", className: "input text-xs" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => handle("approved"), disabled: !!loading, className: "btn-primary flex-1 justify-center text-xs", children: loading === "approved"
                                    ? _jsx("span", { className: "animate-pulse", children: "Approving\u2026" })
                                    : _jsxs(_Fragment, { children: [_jsx(CheckCircle, { size: 13 }), " Approve"] }) }), _jsx("button", { onClick: () => handle("rejected"), disabled: !!loading, className: "btn-danger flex-1 justify-center text-xs", children: loading === "rejected"
                                    ? _jsx("span", { className: "animate-pulse", children: "Rejecting\u2026" })
                                    : _jsxs(_Fragment, { children: [_jsx(XCircle, { size: 13 }), " Reject"] }) })] })] })), !isPending && approval.review_note && (_jsxs("p", { className: "text-xs text-slate-400 italic border-t border-white/8 pt-2", children: ["\"", approval.review_note, "\""] }))] }));
}
