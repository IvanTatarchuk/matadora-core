import React, { useEffect, useState } from "react";
import { scientists as scientistsApi, type Scientist } from "../lib/api";
import { FlaskConical, Scale, DollarSign, Microscope, Atom, Zap, BookOpen, Brain, Landmark, ChevronRight } from "lucide-react";

const ROLE_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  lead:        { label: "CEO / Director",     color: "from-violet-500 to-purple-700",  Icon: Landmark },
  researcher:  { label: "Researcher",         color: "from-blue-500 to-blue-700",      Icon: Atom },
  engineer:    { label: "Engineer",           color: "from-orange-500 to-amber-700",   Icon: Zap },
  analyst:     { label: "Analyst",            color: "from-cyan-500 to-teal-700",      Icon: Microscope },
  critic:      { label: "Critic",             color: "from-red-500 to-rose-700",       Icon: Brain },
  synthesizer: { label: "Synthesizer",        color: "from-emerald-500 to-green-700",  Icon: BookOpen },
  legal:       { label: "Chief Legal Officer",color: "from-slate-500 to-slate-700",    Icon: Scale },
  financial:   { label: "CFO",               color: "from-yellow-500 to-yellow-700",   Icon: DollarSign },
};

const SCIENTIST_EMOJI: Record<string, string> = {
  "Albert Einstein":   "⚛️",
  "Nikola Tesla":      "⚡",
  "Marie Curie":       "☢️",
  "Leonardo da Vinci": "🎨",
  "Alan Turing":       "💻",
  "Isaac Newton":      "🍎",
  "Richard Feynman":   "🔬",
  "Victoria Drake":    "👑",
  "Alexander Law":     "⚖️",
  "Eleanor Hayes":     "💰",
};

interface Props {
  onBack: () => void;
}

export default function TeamPage({ onBack }: Props) {
  const [members, setMembers] = useState<Scientist[]>([]);
  const [selected, setSelected] = useState<Scientist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scientistsApi.list()
      .then(setMembers)
      .finally(() => setLoading(false));
  }, []);

  const scientists = members.filter(m => !["legal","financial","lead"].includes(m.role));
  const corporate  = members.filter(m =>  ["legal","financial","lead"].includes(m.role));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b border-white/8 bg-surface-800 flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost px-2 py-1 text-xs">← Back</button>
        <FlaskConical size={20} className="text-accent" />
        <div>
          <h1 className="text-lg font-bold text-white">Matadora Corporation Team</h1>
          <p className="text-xs text-slate-400">The greatest minds in history, working for humanity's future</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className="w-72 shrink-0 border-r border-white/8 overflow-y-auto py-4 px-3 space-y-6">
          <Section title="🔬 Scientists" members={scientists} selected={selected} onSelect={setSelected} loading={loading} />
          <Section title="🏛️ Corporate"  members={corporate}  selected={selected} onSelect={setSelected} loading={loading} />
        </div>

        {/* Detail */}
        <div className="flex-1 overflow-y-auto p-8">
          {selected ? (
            <MemberDetail member={selected} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
              <FlaskConical size={40} className="opacity-20" />
              <p className="text-sm">Select a team member to view their profile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title, members, selected, onSelect, loading
}: {
  title: string; members: Scientist[]; selected: Scientist | null;
  onSelect: (s: Scientist) => void; loading: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2">{title}</p>
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          {members.map(m => {
            const meta = ROLE_META[m.role] ?? ROLE_META["researcher"];
            const isActive = selected?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                  isActive ? "bg-accent/20 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                <span className="text-xl">{SCIENTIST_EMOJI[m.name] ?? "🧪"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  <p className="text-xs text-slate-500">{meta.label}</p>
                </div>
                <ChevronRight size={13} className="shrink-0 text-slate-600" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberDetail({ member }: { member: Scientist }) {
  const meta = ROLE_META[member.role] ?? ROLE_META["researcher"];
  const { Icon } = meta;
  const persona = member.persona as Record<string, unknown>;

  return (
    <div className="max-w-2xl">
      {/* Avatar & title */}
      <div className="flex items-center gap-5 mb-8">
        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-4xl shadow-lg`}>
          {SCIENTIST_EMOJI[member.name] ?? "🧪"}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{member.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Icon size={14} className="text-slate-400" />
            <span className="text-sm text-slate-400">{meta.label}</span>
            <span className="w-1 h-1 rounded-full bg-slate-600" />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r ${meta.color} text-white`}>
              {member.role.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {!!persona.description && (
        <Card title="About">
          <p className="text-sm text-slate-300 leading-relaxed">{String(persona.description)}</p>
        </Card>
      )}

      {/* Strengths */}
      {Array.isArray(persona.strengths) && (persona.strengths as unknown[]).length > 0 && (
        <Card title="Strengths">
          <div className="flex flex-wrap gap-2">
            {(persona.strengths as string[]).map(s => (
              <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-white/8 text-slate-300 border border-white/10">{s}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Domain */}
      {Array.isArray(persona.domain_keywords) && (persona.domain_keywords as unknown[]).length > 0 && (
        <Card title="Domain Keywords">
          <div className="flex flex-wrap gap-2">
            {(persona.domain_keywords as string[]).map(k => (
              <span key={k} className={`text-xs px-2.5 py-1 rounded-full bg-gradient-to-r ${meta.color} bg-opacity-20 text-white`}>{k}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Constraints */}
      {Array.isArray(persona.constraints) && (persona.constraints as unknown[]).length > 0 && (
        <Card title="Operating Principles">
          <ul className="space-y-1.5">
            {(persona.constraints as string[]).map(c => (
              <li key={c} className="text-xs text-slate-400 flex gap-2">
                <span className="text-accent mt-0.5">•</span>{c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!!persona.communication_style && (
        <Card title="Communication Style">
          <p className="text-sm text-slate-300 italic">"{String(persona.communication_style)}"</p>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode; }) {
  return (
    <div className="mb-5 rounded-xl border border-white/8 bg-surface-800 p-5">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}
