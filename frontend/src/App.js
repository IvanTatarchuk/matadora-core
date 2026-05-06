import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import { sessions as sessionsApi, scientists as scientistsApi, wallet as walletApi } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import MarketplacePage from "./pages/MarketplacePage";
import TeamPage from "./pages/TeamPage";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
export default function App() {
    const [authSession, setAuthSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [scientists, setScientists] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [pendingCount, _setPendingCount] = useState(0);
    const [view, setView] = useState("chat");
    const [walletBalance, setWalletBalance] = useState(null);
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
        if (!authSession)
            return;
        scientistsApi.list().then(setScientists).catch(() => { });
        walletApi.get().then(w => setWalletBalance(w.balance)).catch(() => { });
    }, [authSession]);
    const loadSessions = () => {
        return fetch("/api/v1/sessions", {
            headers: { Authorization: `Bearer ${authSession?.access_token}` },
        })
            .then((r) => r.json())
            .then((data) => {
            if (Array.isArray(data))
                setSessions(data);
        })
            .catch(() => { });
    };
    useEffect(() => {
        if (!authSession)
            return;
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
        return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-surface-900", children: _jsx(Loader2, { size: 24, className: "animate-spin text-slate-500" }) }));
    }
    if (!authSession)
        return _jsx(LoginPage, {});
    if (view === "approvals")
        return _jsx("div", { className: "h-screen overflow-hidden", children: _jsx(ApprovalsPage, { onBack: () => setView("chat") }) });
    if (view === "marketplace")
        return _jsxs("div", { className: "h-screen overflow-hidden flex", children: [_jsx(SidebarWrapper, {}), _jsx("div", { className: "flex-1 overflow-hidden", children: _jsx(MarketplacePage, { onBack: () => setView("chat") }) })] });
    if (view === "team")
        return _jsxs("div", { className: "h-screen overflow-hidden flex", children: [_jsx(SidebarWrapper, {}), _jsx("div", { className: "flex-1 overflow-hidden", children: _jsx(TeamPage, { onBack: () => setView("chat") }) })] });
    function SidebarWrapper() {
        return (_jsx(Sidebar, { sessions: sessions, activeId: activeSession, onSelect: (id) => { setActiveSession(id); setView("chat"); }, onNew: handleNewSession, pendingCount: pendingCount, onApprovalsClick: () => setView("approvals"), onMarketplace: () => setView("marketplace"), onTeam: () => setView("team"), walletBalance: walletBalance }));
    }
    return (_jsxs("div", { className: "flex h-screen overflow-hidden", children: [_jsx(Sidebar, { sessions: sessions, activeId: activeSession, onSelect: (id) => { setActiveSession(id); setView("chat"); }, onNew: handleNewSession, pendingCount: pendingCount, onApprovalsClick: () => setView("approvals"), onMarketplace: () => setView("marketplace"), onTeam: () => setView("team"), walletBalance: walletBalance }), _jsx("main", { className: "flex-1 flex flex-col h-full overflow-hidden", children: activeSession ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "shrink-0 px-6 py-3 border-b border-white/8 bg-surface-800 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-2 w-2 rounded-full bg-emerald-400" }), _jsx("span", { className: "text-sm font-medium text-slate-200", children: sessions.find((s) => s.id === activeSession)?.title ?? "Session" })] }), _jsx("span", { className: "text-xs text-slate-500 font-mono", children: activeSession.slice(0, 8) })] }), _jsx("div", { className: "flex-1 overflow-hidden relative", children: _jsx(ChatWindow, { sessionId: activeSession, scientists: scientists }) })] })) : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center gap-4 text-slate-500", children: [_jsx("p", { className: "text-sm", children: "Select or create a session to begin." }), _jsx("button", { onClick: handleNewSession, className: "btn-primary", children: "Start new session" })] })) })] }));
}
