import { useEffect, useState } from "react";
import { technologies as techApi, wallet as walletApi, type Technology, type Wallet } from "../lib/api";
import { ShoppingCart, Coins, Tag, Beaker, CheckCircle2, Loader2, AlertCircle, Filter } from "lucide-react";

const CATEGORIES = ["all", "energy", "computing", "biotech", "materials", "AI", "space", "general"];

const CATEGORY_COLOR: Record<string, string> = {
  energy:    "bg-amber-500/20 text-amber-300 border-amber-500/30",
  computing: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  biotech:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  materials: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  AI:        "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  space:     "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  general:   "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

interface Props {
  onBack: () => void;
}

export default function MarketplacePage({ onBack }: Props) {
  const [items, setItems]         = useState<Technology[]>([]);
  const [walletData, setWallet]   = useState<Wallet | null>(null);
  const [purchases, setPurchases] = useState<Set<string>>(new Set());
  const [category, setCategory]   = useState("all");
  const [loading, setLoading]     = useState(true);
  const [buying, setBuying]       = useState<string | null>(null);
  const [toast, setToast]         = useState<{ type: "success"|"error"; msg: string } | null>(null);

  const showToast = (type: "success"|"error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [techs, w, mine] = await Promise.all([
        techApi.list("published"),
        walletApi.get(),
        techApi.myPurchases(),
      ]);
      setItems(techs);
      setWallet(w);
      setPurchases(new Set(mine.map(p => p.technologies?.id).filter(Boolean)));
    } catch {
      showToast("error", "Failed to load marketplace data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleBuy = async (tech: Technology) => {
    if (purchases.has(tech.id)) return;
    setBuying(tech.id);
    try {
      const result = await techApi.buy(tech.id);
      setPurchases(prev => new Set([...prev, tech.id]));
      setWallet(prev => prev ? { ...prev, balance: result.new_balance } : prev);
      showToast("success", `✅ Purchased "${result.technology}" for ${result.price_paid} MTD`);
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBuying(null);
    }
  };

  const filtered = category === "all" ? items : items.filter(t => t.category === category);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b border-white/8 bg-surface-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="btn-ghost px-2 py-1 text-xs">← Back</button>
            <ShoppingCart size={20} className="text-accent" />
            <div>
              <h1 className="text-lg font-bold text-white">Technology Marketplace</h1>
              <p className="text-xs text-slate-400">
                Purchase breakthrough technologies created by our scientists · Powered by MTD
              </p>
            </div>
          </div>

          {/* Wallet balance */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30">
            <Coins size={16} className="text-yellow-400" />
            <div>
              <p className="text-xs text-slate-400">Your Balance</p>
              <p className="font-bold text-yellow-300 text-sm">
                {walletData ? `${walletData.balance.toFixed(2)} MTD` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Filter size={14} className="text-slate-500 mt-1.5" />
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={[
                "text-xs px-3 py-1 rounded-full border transition-colors capitalize",
                category === c
                  ? "bg-accent border-accent text-white"
                  : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200",
              ].join(" ")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-slate-500" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(tech => (
              <TechCard
                key={tech.id}
                tech={tech}
                owned={purchases.has(tech.id)}
                buying={buying === tech.id}
                balance={walletData?.balance ?? 0}
                onBuy={() => handleBuy(tech)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={[
          "fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium z-50",
          toast.type === "success"
            ? "bg-emerald-900/90 text-emerald-200 border border-emerald-700"
            : "bg-red-900/90 text-red-200 border border-red-700",
        ].join(" ")}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function TechCard({
  tech, owned, buying, balance, onBuy,
}: {
  tech: Technology; owned: boolean; buying: boolean; balance: number; onBuy: () => void;
}) {
  const catColor = CATEGORY_COLOR[tech.category] ?? CATEGORY_COLOR.general;
  const canAfford = balance >= tech.price_mtd;

  return (
    <div className="flex flex-col rounded-2xl border border-white/8 bg-surface-800 overflow-hidden hover:border-white/15 transition-colors group">
      {/* Top banner */}
      <div className="h-2 bg-gradient-to-r from-accent to-violet-600" />

      <div className="flex-1 p-5">
        {/* Category + status */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${catColor}`}>{tech.category}</span>
          {owned && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 size={10} /> Owned
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white mb-2 group-hover:text-accent transition-colors">
          {tech.title}
        </h3>

        {/* Summary / description */}
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
          {tech.summary || tech.description}
        </p>

        {/* Inventors */}
        {tech.inventor_ids?.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <Beaker size={11} className="text-slate-500" />
            <span className="text-xs text-slate-500">{tech.inventor_ids.length} inventor{tech.inventor_ids.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Footer: price + buy */}
      <div className="px-5 py-4 border-t border-white/6 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Tag size={14} className="text-yellow-400" />
          <span className="font-bold text-yellow-300">{tech.price_mtd.toFixed(0)} MTD</span>
        </div>

        {owned ? (
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 size={13} /> Purchased
          </span>
        ) : (
          <button
            onClick={onBuy}
            disabled={buying || !canAfford}
            className={[
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
              canAfford
                ? "bg-accent hover:bg-accent/80 text-white"
                : "bg-white/5 text-slate-500 cursor-not-allowed",
            ].join(" ")}
            title={!canAfford ? `Need ${tech.price_mtd} MTD, you have ${balance.toFixed(0)}` : undefined}
          >
            {buying ? <Loader2 size={12} className="animate-spin" /> : <ShoppingCart size={12} />}
            {canAfford ? "Buy" : "Insufficient MTD"}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-4">
      <ShoppingCart size={40} className="opacity-20" />
      <div className="text-center">
        <p className="text-sm font-medium">No technologies available yet</p>
        <p className="text-xs mt-1">Our scientists are working hard — check back soon!</p>
      </div>
    </div>
  );
}
