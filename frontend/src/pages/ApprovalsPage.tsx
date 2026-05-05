import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { approvals as approvalsApi } from "../lib/api";
import type { Approval } from "../lib/api";
import ApprovalCard from "../components/ApprovalCard";

interface Props {
  onBack: () => void;
}

type Filter = "pending" | "approved" | "rejected" | "all";

export default function ApprovalsPage({ onBack }: Props) {
  const [items, setItems]     = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>("pending");

  const load = () => {
    setLoading(true);
    approvalsApi.list().then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const visible = filter === "all" ? items : items.filter((a) => a.status === filter);

  const counts = {
    pending:  items.filter((a) => a.status === "pending").length,
    approved: items.filter((a) => a.status === "approved").length,
    rejected: items.filter((a) => a.status === "rejected").length,
  };

  const handleReviewed = (updated: Approval) => {
    setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "pending",  label: "Pending",  count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "rejected", label: "Rejected", count: counts.rejected },
    { key: "all",      label: "All" },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 bg-surface-800">
        <button onClick={onBack} className="btn-ghost p-2">
          <ArrowLeft size={16} />
        </button>
        <ShieldCheck size={18} className="text-accent" />
        <h1 className="font-semibold text-slate-100">Approval Queue</h1>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost p-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-white/8">
        {FILTERS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
              filter === key
                ? "bg-accent/20 text-accent"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5",
            ].join(" ")}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                filter === key ? "bg-accent text-white" : "bg-white/10 text-slate-300"
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-slate-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <ShieldCheck size={32} className="text-slate-600" />
            <p className="text-sm">No {filter === "all" ? "" : filter} items.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((a) => (
              <ApprovalCard key={a.id} approval={a} onReviewed={handleReviewed} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
