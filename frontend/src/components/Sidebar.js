import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Plus, MessageSquare, CheckCircle, LogOut, FlaskConical, ShoppingCart, Users, Coins } from "lucide-react";
import { supabase } from "../lib/supabase";
const STATUS_DOT = {
    open: "bg-emerald-400",
    paused: "bg-amber-400",
    closed: "bg-slate-500",
    archived: "bg-slate-600",
};
export default function Sidebar({ sessions, activeId, onSelect, onNew, pendingCount, onApprovalsClick, onMarketplace, onTeam, walletBalance, }) {
    const [creating, setCreating] = useState(false);
    const handleNew = async () => {
        setCreating(true);
        await onNew();
        setCreating(false);
    };
    return (_jsxs("aside", { className: "flex flex-col w-64 shrink-0 h-full bg-surface-800 border-r border-white/8", children: [_jsxs("div", { className: "flex items-center gap-2.5 px-5 py-4 border-b border-white/8", children: [_jsx(FlaskConical, { size: 20, className: "text-accent" }), _jsx("span", { className: "font-semibold tracking-tight text-slate-100", children: "Matadora Core" })] }), _jsx("div", { className: "px-3 pt-3 pb-2", children: _jsxs("button", { onClick: handleNew, disabled: creating, className: "btn-primary w-full justify-center", children: [_jsx(Plus, { size: 15 }), "New Session"] }) }), _jsxs("nav", { className: "flex-1 overflow-y-auto px-2 py-1 space-y-0.5", children: [sessions.length === 0 && (_jsx("p", { className: "text-xs text-slate-500 px-3 py-4 text-center", children: "No sessions yet" })), sessions.map((s) => (_jsxs("button", { onClick: () => onSelect(s.id), className: [
                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
                            activeId === s.id
                                ? "bg-accent/20 text-white"
                                : "text-slate-300 hover:bg-white/5 hover:text-white",
                        ].join(" "), children: [_jsx("span", { className: `mt-0.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[s.status] ?? "bg-slate-500"}` }), _jsx("span", { className: "truncate flex-1", children: s.title }), _jsx(MessageSquare, { size: 13, className: "shrink-0 text-slate-500" })] }, s.id)))] }), _jsxs("div", { className: "border-t border-white/8 px-2 py-2 space-y-0.5", children: [walletBalance !== null && (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-1", children: [_jsx(Coins, { size: 13, className: "text-yellow-400 shrink-0" }), _jsxs("span", { className: "text-xs text-yellow-300 font-semibold", children: [walletBalance.toFixed(1), " MTD"] })] })), _jsxs("button", { onClick: onMarketplace, className: "btn-ghost w-full", children: [_jsx(ShoppingCart, { size: 15 }), "Marketplace"] }), _jsxs("button", { onClick: onTeam, className: "btn-ghost w-full", children: [_jsx(Users, { size: 15 }), "Our Team"] }), _jsxs("button", { onClick: onApprovalsClick, className: "btn-ghost w-full justify-between", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx(CheckCircle, { size: 15 }), "Approvals"] }), pendingCount > 0 && (_jsx("span", { className: "bg-accent rounded-full text-xs font-bold px-2 py-0.5 text-white", children: pendingCount }))] }), _jsxs("button", { onClick: () => supabase.auth.signOut(), className: "btn-ghost w-full", children: [_jsx(LogOut, { size: 15 }), "Sign out"] })] })] }));
}
