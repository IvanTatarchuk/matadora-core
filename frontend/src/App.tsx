import { useEffect, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import { sessions as sessionsApi, scientists as scientistsApi, wallet as walletApi } from "./lib/api";
import type { Session, Scientist } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import MarketplacePage from "./pages/MarketplacePage";
import TeamPage from "./pages/TeamPage";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";

type View = "chat" | "approvals" | "marketplace" | "team";

export default function App() {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions]           = useState<Session[]>([]);
  const [scientists, setScientists]       = useState<Scientist[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [pendingCount, _setPendingCount]  = useState(0);
  const [view, setView]                   = useState<View>("chat");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authSession) return;
    scientistsApi.list().then(setScientists).catch(() => {});
    walletApi.get().then(w => setWalletBalance(w.balance)).catch(() => {});
  }, [authSession]);

  const loadSessions = () => {
    return fetch("/api/v1/sessions", {
      headers: { Authorization: `Bearer ${authSession?.access_token}` },
    })
      .then((r) => r.json())
      .then((data: Session[]) => {
        if (Array.isArray(data)) setSessions(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!authSession) return;
    loadSessions();
  }, [authSession]);

  const handleNewSession = async () => {
    const title = `Session ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    const s = await sessionsApi.create(title);
    setSessions((prev) => [s, ...prev]);
    setActiveSession(s.id);
    setView("chat");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (!authSession) return <LoginPage />;

  if (view === "approvals")  return <div className="h-screen overflow-hidden"><ApprovalsPage onBack={() => setView("chat")} /></div>;
  if (view === "marketplace") return <div className="h-screen overflow-hidden flex"><SidebarWrapper /><div className="flex-1 overflow-hidden"><MarketplacePage onBack={() => setView("chat")} /></div></div>;
  if (view === "team")        return <div className="h-screen overflow-hidden flex"><SidebarWrapper /><div className="flex-1 overflow-hidden"><TeamPage onBack={() => setView("chat")} /></div></div>;

  function SidebarWrapper() {
    return (
      <Sidebar
        sessions={sessions} activeId={activeSession}
        onSelect={(id) => { setActiveSession(id); setView("chat"); }}
        onNew={handleNewSession} pendingCount={pendingCount}
        onApprovalsClick={() => setView("approvals")}
        onMarketplace={() => setView("marketplace")}
        onTeam={() => setView("team")}
        walletBalance={walletBalance}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        sessions={sessions}
        activeId={activeSession}
        onSelect={(id) => { setActiveSession(id); setView("chat"); }}
        onNew={handleNewSession}
        pendingCount={pendingCount}
        onApprovalsClick={() => setView("approvals")}
        onMarketplace={() => setView("marketplace")}
        onTeam={() => setView("team")}
        walletBalance={walletBalance}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {activeSession ? (
          <>
            {/* Session header */}
            <div className="shrink-0 px-6 py-3 border-b border-white/8 bg-surface-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-slate-200">
                  {sessions.find((s) => s.id === activeSession)?.title ?? "Session"}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">{activeSession.slice(0, 8)}</span>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <ChatWindow sessionId={activeSession} scientists={scientists} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
            <p className="text-sm">Select or create a session to begin.</p>
            <button onClick={handleNewSession} className="btn-primary">
              Start new session
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
