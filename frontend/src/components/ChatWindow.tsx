import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2, ChevronDown, FlaskConical, Zap } from "lucide-react";
import type { Message, Scientist, Technology } from "../lib/api";
import { messages as messagesApi } from "../lib/api";
import { getAccessToken } from "../lib/supabase";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

const SCIENTIST_COLORS: Record<string, string> = {
  "Albert Einstein":    "text-blue-400    bg-blue-500/10    border-blue-500/30",
  "Nikola Tesla":       "text-amber-400   bg-amber-500/10   border-amber-500/30",
  "Marie Curie":        "text-pink-400    bg-pink-500/10    border-pink-500/30",
  "Leonardo da Vinci":  "text-orange-400  bg-orange-500/10  border-orange-500/30",
  "Alan Turing":        "text-cyan-400    bg-cyan-500/10    border-cyan-500/30",
  "Isaac Newton":       "text-red-400     bg-red-500/10     border-red-500/30",
  "Richard Feynman":    "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "Victoria Drake":     "text-violet-400  bg-violet-500/10  border-violet-500/30",
  "Alexander Law":      "text-slate-400   bg-slate-500/10   border-slate-500/30",
  "Eleanor Hayes":      "text-yellow-400  bg-yellow-500/10  border-yellow-500/30",
};
const DEFAULT_COLOR = "text-slate-300 bg-white/5 border-white/10";

const SCIENTIST_EMOJI: Record<string, string> = {
  "Albert Einstein": "⚛️", "Nikola Tesla": "⚡", "Marie Curie": "☢️",
  "Leonardo da Vinci": "🎨", "Alan Turing": "💻", "Isaac Newton": "🍎",
  "Richard Feynman": "🔬", "Victoria Drake": "👑", "Alexander Law": "⚖️", "Eleanor Hayes": "💰",
};

interface Props {
  sessionId:  string;
  scientists: Scientist[];
}

interface StreamingMsg {
  scientist: string;
  content:   string;
  done:      boolean;
}

async function runOrchestration(sessionId: string, content: string, mode = "single") {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/orchestration/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ session_id: sessionId, content, mode }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Orchestration failed");
  return res.json() as Promise<{ messages: Message[]; technology: Technology | null; routed_to: string[] }>;
}

export default function ChatWindow({ sessionId, scientists }: Props) {
  const [history, setHistory]         = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [target, setTarget]           = useState(scientists[0]?.name ?? "Albert Einstein");
  const [streaming, setStreaming]     = useState<StreamingMsg | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [newTech, setNewTech]         = useState<Technology | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setHistory([]);
    setNewTech(null);
    messagesApi
      .list(sessionId)
      .then(setHistory)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (scientists.length > 0 && target === "Albert Einstein" && !scientists.find(s => s.name === target)) {
      setTarget(scientists[0].name);
    }
  }, [scientists]);

  useEffect(() => {
    if (!streaming || streaming.done) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, streaming]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const handleOrchestrate = async () => {
    const text = input.trim();
    if (!text || orchestrating || streaming) return;
    setOrchestrating(true);
    setInput("");
    setError(null);
    setNewTech(null);

    const optimisticUser: Message = {
      id: crypto.randomUUID(), session_id: sessionId,
      scientist_id: null, role: "user", content: text,
      metadata: {}, parent_id: null, created_at: new Date().toISOString(),
    };
    setHistory((h) => [...h, optimisticUser]);

    try {
      const result = await runOrchestration(sessionId, text, "panel");
      const responseMessages: Message[] = result.messages.map((m) => ({
        ...m,
        created_at: m.created_at ?? new Date().toISOString(),
      }));
      setHistory((h) => [...h, ...responseMessages]);
      if (result.technology) setNewTech(result.technology);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally {
      setOrchestrating(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const optimisticUser: Message = {
      id: crypto.randomUUID(), session_id: sessionId,
      scientist_id: null, role: "user", content: text,
      metadata: {}, parent_id: null,
      created_at: new Date().toISOString(),
    };
    setHistory((h) => [...h, optimisticUser]);
    setInput("");
    setError(null);

    const partial: StreamingMsg = { scientist: target, content: "", done: false };
    setStreaming(partial);

    await messagesApi.stream(
      sessionId, text, target,
      (delta) => setStreaming((s) => s ? { ...s, content: s.content + delta } : s),
      () => {
        setStreaming((s) => {
          if (!s) return null;
          const finalMsg: Message = {
            id: crypto.randomUUID(), session_id: sessionId,
            scientist_id: null, role: "assistant", content: s.content,
            metadata: { scientist: s.scientist }, parent_id: optimisticUser.id,
            created_at: new Date().toISOString(),
          };
          setHistory((h) => [...h, finalMsg]);
          return null;
        });
      },
      (err) => { setError(err); setStreaming(null); }
    );
  };

  const renderMessage = (msg: Message, idx: number) => {
    const isUser = msg.role === "user";
    const scientistName = (msg.metadata?.scientist as string) ?? "";
    const colorClass = SCIENTIST_COLORS[scientistName] ?? DEFAULT_COLOR;
    const emoji = SCIENTIST_EMOJI[scientistName];

    return (
      <div key={msg.id ?? idx} className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center border text-sm ${isUser ? "bg-accent/20 border-accent/40" : colorClass}`}>
          {isUser
            ? <User size={14} className="text-accent" />
            : emoji
              ? <span>{emoji}</span>
              : <Bot size={14} className={colorClass.split(" ")[0]} />
          }
        </div>

        {/* Bubble */}
        <div className={`max-w-[75%] flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
          {!isUser && scientistName && (
            <span className={`text-xs font-medium px-1 ${colorClass.split(" ")[0]}`}>{scientistName}</span>
          )}
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-accent/80 text-white rounded-tr-sm"
              : `card border ${colorClass.split(" ").slice(1).join(" ")} rounded-tl-sm text-slate-100`
          }`}>
            {msg.content}
          </div>
          <span className="text-xs text-slate-600 px-1">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 size={22} className="animate-spin text-slate-500" />
          </div>
        )}
        {!loading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
            <Bot size={32} className="text-slate-600" />
            <p className="text-sm">Start the session — ask your scientists anything.</p>
          </div>
        )}

        {history.map(renderMessage)}

        {/* Streaming bubble */}
        {streaming && (
          <div className="flex gap-3 animate-fade-in">
            <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center border ${SCIENTIST_COLORS[streaming.scientist] ?? DEFAULT_COLOR}`}>
              <Bot size={14} className={(SCIENTIST_COLORS[streaming.scientist] ?? DEFAULT_COLOR).split(" ")[0]} />
            </div>
            <div className="max-w-[75%] flex flex-col gap-1 items-start">
              <span className={`text-xs font-medium px-1 ${(SCIENTIST_COLORS[streaming.scientist] ?? DEFAULT_COLOR).split(" ")[0]}`}>
                {streaming.scientist}
              </span>
              <div className="card border px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
                {streaming.content}
                {!streaming.done && <span className="streaming-cursor" />}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-8 btn bg-surface-700 border border-white/10 text-slate-300 hover:text-white shadow-xl"
        >
          <ChevronDown size={15} />
        </button>
      )}

      {/* New Technology Card */}
      {newTech && (
        <div className="shrink-0 mx-4 mb-2 rounded-xl border border-yellow-500/40 bg-gradient-to-r from-yellow-900/30 to-amber-900/20 p-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">🧪 New Technology Created!</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">{newTech.category}</span>
              </div>
              <p className="font-bold text-white text-sm">{newTech.title}</p>
              <p className="text-xs text-slate-400 mt-1">{newTech.summary}</p>
              <p className="text-xs text-yellow-300 mt-2 font-semibold">Listed in Marketplace · {newTech.price_mtd} MTD</p>
            </div>
            <button onClick={() => setNewTech(null)} className="text-slate-500 hover:text-white shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 px-4 py-3 border-t border-white/8 bg-surface-800">
        <div className="flex items-end gap-2">
          {/* Scientist selector */}
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="input w-40 shrink-0 text-xs"
          >
            {scientists.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>

          {/* Text area */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask scientists… (Enter = send one, or click Research for panel)"
            rows={1}
            className="input flex-1 resize-none min-h-[38px] max-h-40"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
          />

          {/* Send to one */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || !!streaming || orchestrating}
            title="Send to selected scientist"
            className="btn-ghost shrink-0 h-[38px] px-3 border border-white/10"
          >
            {streaming
              ? <Loader2 size={15} className="animate-spin" />
              : <Send size={15} />
            }
          </button>

          {/* Research (full panel) */}
          <button
            onClick={handleOrchestrate}
            disabled={!input.trim() || !!streaming || orchestrating}
            title="Full research panel: all scientists collaborate + technology created"
            className="btn-primary shrink-0 h-[38px] px-3 gap-1.5"
          >
            {orchestrating
              ? <Loader2 size={15} className="animate-spin" />
              : <FlaskConical size={15} />}
            Research
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 px-1">
          <Zap size={10} className="inline mr-1" />
          <strong>Research</strong> = full panel of scientists + auto-creates a technology in the Marketplace
        </p>
      </div>
    </div>
  );
}
