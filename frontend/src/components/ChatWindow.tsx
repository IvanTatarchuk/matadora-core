import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2, ChevronDown } from "lucide-react";
import type { Message, Scientist } from "../lib/api";
import { messages as messagesApi } from "../lib/api";

const SCIENTIST_COLORS: Record<string, string> = {
  Athena:    "text-violet-400  bg-violet-500/10 border-violet-500/30",
  Prometheus:"text-amber-400   bg-amber-500/10  border-amber-500/30",
  Socrates:  "text-red-400     bg-red-500/10    border-red-500/30",
  Hermes:    "text-cyan-400    bg-cyan-500/10   border-cyan-500/30",
  Mnemosyne: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};
const DEFAULT_COLOR = "text-slate-300 bg-white/5 border-white/10";

interface Props {
  sessionId:  string;
  scientists: Scientist[];
}

interface StreamingMsg {
  scientist: string;
  content:   string;
  done:      boolean;
}

export default function ChatWindow({ sessionId, scientists }: Props) {
  const [history, setHistory]         = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [target, setTarget]           = useState("Athena");
  const [streaming, setStreaming]     = useState<StreamingMsg | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setHistory([]);
    messagesApi
      .list(sessionId)
      .then(setHistory)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sessionId]);

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

    return (
      <div key={msg.id ?? idx} className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center border ${isUser ? "bg-accent/20 border-accent/40" : colorClass}`}>
          {isUser
            ? <User size={14} className="text-accent" />
            : <Bot  size={14} className={SCIENTIST_COLORS[scientistName] ? colorClass.split(" ")[0] : "text-slate-400"} />
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

      {/* Input bar */}
      <div className="shrink-0 px-4 py-3 border-t border-white/8 bg-surface-800">
        <div className="flex items-end gap-2">
          {/* Scientist selector */}
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="input w-36 shrink-0 text-xs"
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
            placeholder="Ask your scientists… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="input flex-1 resize-none min-h-[38px] max-h-40"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || !!streaming}
            className="btn-primary shrink-0 h-[38px]"
          >
            {streaming
              ? <Loader2 size={15} className="animate-spin" />
              : <Send size={15} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
