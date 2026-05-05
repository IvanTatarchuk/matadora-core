import { useState } from "react";
import { Plus, MessageSquare, CheckCircle, LogOut, FlaskConical, ShoppingCart, Users, Coins } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Session } from "../lib/api";

interface Props {
  sessions:          Session[];
  activeId:          string | null;
  onSelect:          (id: string) => void;
  onNew:             () => void;
  pendingCount:      number;
  onApprovalsClick:  () => void;
  onMarketplace:     () => void;
  onTeam:            () => void;
  walletBalance:     number | null;
}

const STATUS_DOT: Record<string, string> = {
  open:     "bg-emerald-400",
  paused:   "bg-amber-400",
  closed:   "bg-slate-500",
  archived: "bg-slate-600",
};

export default function Sidebar({
  sessions, activeId, onSelect, onNew, pendingCount,
  onApprovalsClick, onMarketplace, onTeam, walletBalance,
}: Props) {
  const [creating, setCreating] = useState(false);

  const handleNew = async () => {
    setCreating(true);
    await onNew();
    setCreating(false);
  };

  return (
    <aside className="flex flex-col w-64 shrink-0 h-full bg-surface-800 border-r border-white/8">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8">
        <FlaskConical size={20} className="text-accent" />
        <span className="font-semibold tracking-tight text-slate-100">Matadora Core</span>
      </div>

      {/* New Session */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={handleNew}
          disabled={creating}
          className="btn-primary w-full justify-center"
        >
          <Plus size={15} />
          New Session
        </button>
      </div>

      {/* Sessions list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-xs text-slate-500 px-3 py-4 text-center">No sessions yet</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={[
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
              activeId === s.id
                ? "bg-accent/20 text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
            ].join(" ")}
          >
            <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[s.status] ?? "bg-slate-500"}`} />
            <span className="truncate flex-1">{s.title}</span>
            <MessageSquare size={13} className="shrink-0 text-slate-500" />
          </button>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-white/8 px-2 py-2 space-y-0.5">
        {/* Wallet balance */}
        {walletBalance !== null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-1">
            <Coins size={13} className="text-yellow-400 shrink-0" />
            <span className="text-xs text-yellow-300 font-semibold">{walletBalance.toFixed(1)} MTD</span>
          </div>
        )}
        <button onClick={onMarketplace} className="btn-ghost w-full">
          <ShoppingCart size={15} />
          Marketplace
        </button>
        <button onClick={onTeam} className="btn-ghost w-full">
          <Users size={15} />
          Our Team
        </button>
        <button
          onClick={onApprovalsClick}
          className="btn-ghost w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <CheckCircle size={15} />
            Approvals
          </span>
          {pendingCount > 0 && (
            <span className="bg-accent rounded-full text-xs font-bold px-2 py-0.5 text-white">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="btn-ghost w-full"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
