import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { approvals as approvalsApi } from "../lib/api";
import ApprovalCard from "../components/ApprovalCard";
export default function ApprovalsPage({ onBack }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("pending");
    const load = () => {
        setLoading(true);
        approvalsApi.list().then(setItems).finally(() => setLoading(false));
    };
    useEffect(load, []);
    const visible = filter === "all" ? items : items.filter((a) => a.status === filter);
    const counts = {
        pending: items.filter((a) => a.status === "pending").length,
        approved: items.filter((a) => a.status === "approved").length,
        rejected: items.filter((a) => a.status === "rejected").length,
    };
    const handleReviewed = (updated) => {
        setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    };
    const FILTERS = [
        { key: "pending", label: "Pending", count: counts.pending },
        { key: "approved", label: "Approved", count: counts.approved },
        { key: "rejected", label: "Rejected", count: counts.rejected },
        { key: "all", label: "All" },
    ];
    return (_jsxs("div", { className: "flex flex-col h-full bg-surface-900", children: [_jsxs("div", { className: "flex items-center gap-3 px-6 py-4 border-b border-white/8 bg-surface-800", children: [_jsx("button", { onClick: onBack, className: "btn-ghost p-2", children: _jsx(ArrowLeft, { size: 16 }) }), _jsx(ShieldCheck, { size: 18, className: "text-accent" }), _jsx("h1", { className: "font-semibold text-slate-100", children: "Approval Queue" }), _jsx("div", { className: "ml-auto flex items-center gap-2", children: _jsx("button", { onClick: load, disabled: loading, className: "btn-ghost p-2", children: _jsx(RefreshCw, { size: 14, className: loading ? "animate-spin" : "" }) }) })] }), _jsx("div", { className: "flex gap-1 px-6 py-3 border-b border-white/8", children: FILTERS.map(({ key, label, count }) => (_jsxs("button", { onClick: () => setFilter(key), className: [
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                        filter === key
                            ? "bg-accent/20 text-accent"
                            : "text-slate-400 hover:text-slate-200 hover:bg-white/5",
                    ].join(" "), children: [label, count !== undefined && count > 0 && (_jsx("span", { className: `rounded-full px-1.5 py-0.5 text-xs font-bold ${filter === key ? "bg-accent text-white" : "bg-white/10 text-slate-300"}`, children: count }))] }, key))) }), _jsx("div", { className: "flex-1 overflow-y-auto px-6 py-4", children: loading ? (_jsx("div", { className: "flex justify-center py-16", children: _jsx(Loader2, { size: 22, className: "animate-spin text-slate-500" }) })) : visible.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 gap-3 text-slate-500", children: [_jsx(ShieldCheck, { size: 32, className: "text-slate-600" }), _jsxs("p", { className: "text-sm", children: ["No ", filter === "all" ? "" : filter, " items."] })] })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: visible.map((a) => (_jsx(ApprovalCard, { approval: a, onReviewed: handleReviewed }, a.id))) })) })] }));
}
