import { useEffect, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import { sessions as sessionsApi, scientists as scientistsApi } from "./lib/api";
import type { Session, Scientist } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";

type View = "chat" | "approvals";

export default function App() {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions]         = useState<Session[]>([]);
  const [scientists, setScientists]     = useState<Scientist[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [view, setView]                 = useState<View>("chat");

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

    scientistsApi.list().then(setScientists).catch(() => {
      setScientists([
        { id: "1", name: "Athena",    role: "lead",        persona: {}, is_active: true, created_at: "" },
        { id: "2", name: "Prometheus",role: "researcher",  persona: {}, is_active: true, created_at: "" },
        { id: "3", name: "Socrates",  role: "critic",      persona: {}, is_active: true, created_at: "" },
        { id: "4", name: "Hermes",    role: "analyst",     persona: {}, is_active: true, created_at: "" },
        { id: "5", name: "Mnemosyne", role: "synthesizer", persona: {}, is_active: true, created_at: "" },
      ]);
    });
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

  if (view === "approvals") {
    return (
      <div className="h-screen overflow-hidden">
        <ApprovalsPage onBack={() => setView("chat")} />
      </div>
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
