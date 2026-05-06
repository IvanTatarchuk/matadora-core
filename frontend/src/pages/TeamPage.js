import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { scientists as scientistsApi } from "../lib/api";
import { FlaskConical, Scale, DollarSign, Microscope, Atom, Zap, BookOpen, Brain, Landmark, ChevronRight } from "lucide-react";
const ROLE_META = {
    lead: { label: "CEO / Director", color: "from-violet-500 to-purple-700", Icon: Landmark },
    researcher: { label: "Researcher", color: "from-blue-500 to-blue-700", Icon: Atom },
    engineer: { label: "Engineer", color: "from-orange-500 to-amber-700", Icon: Zap },
    analyst: { label: "Analyst", color: "from-cyan-500 to-teal-700", Icon: Microscope },
    critic: { label: "Critic", color: "from-red-500 to-rose-700", Icon: Brain },
    synthesizer: { label: "Synthesizer", color: "from-emerald-500 to-green-700", Icon: BookOpen },
    legal: { label: "Chief Legal Officer", color: "from-slate-500 to-slate-700", Icon: Scale },
    financial: { label: "CFO", color: "from-yellow-500 to-yellow-700", Icon: DollarSign },
};
const SCIENTIST_EMOJI = {
    "Albert Einstein": "⚛️",
    "Nikola Tesla": "⚡",
    "Marie Curie": "☢️",
    "Leonardo da Vinci": "🎨",
    "Alan Turing": "💻",
    "Isaac Newton": "🍎",
    "Richard Feynman": "🔬",
    "Victoria Drake": "👑",
    "Alexander Law": "⚖️",
    "Eleanor Hayes": "💰",
};
export default function TeamPage({ onBack }) {
    const [members, setMembers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        scientistsApi.list()
            .then(setMembers)
            .finally(() => setLoading(false));
    }, []);
    const scientists = members.filter(m => !["legal", "financial", "lead"].includes(m.role));
    const corporate = members.filter(m => ["legal", "financial", "lead"].includes(m.role));
    return (_jsxs("div", { className: "h-full flex flex-col overflow-hidden", children: [_jsxs("div", { className: "shrink-0 px-8 py-5 border-b border-white/8 bg-surface-800 flex items-center gap-3", children: [_jsx("button", { onClick: onBack, className: "btn-ghost px-2 py-1 text-xs", children: "\u2190 Back" }), _jsx(FlaskConical, { size: 20, className: "text-accent" }), _jsxs("div", { children: [_jsx("h1", { className: "text-lg font-bold text-white", children: "Matadora Corporation Team" }), _jsx("p", { className: "text-xs text-slate-400", children: "The greatest minds in history, working for humanity's future" })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "w-72 shrink-0 border-r border-white/8 overflow-y-auto py-4 px-3 space-y-6", children: [_jsx(Section, { title: "\uD83D\uDD2C Scientists", members: scientists, selected: selected, onSelect: setSelected, loading: loading }), _jsx(Section, { title: "\uD83C\uDFDB\uFE0F Corporate", members: corporate, selected: selected, onSelect: setSelected, loading: loading })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-8", children: selected ? (_jsx(MemberDetail, { member: selected })) : (_jsxs("div", { className: "h-full flex flex-col items-center justify-center text-slate-500 gap-3", children: [_jsx(FlaskConical, { size: 40, className: "opacity-20" }), _jsx("p", { className: "text-sm", children: "Select a team member to view their profile" })] })) })] })] }));
}
function Section({ title, members, selected, onSelect, loading }) {
    return (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2", children: title }), loading ? (_jsx("div", { className: "space-y-2", children: [1, 2, 3].map(i => (_jsx("div", { className: "h-12 rounded-lg bg-white/5 animate-pulse" }, i))) })) : (_jsx("div", { className: "space-y-0.5", children: members.map(m => {
                    const meta = ROLE_META[m.role] ?? ROLE_META["researcher"];
                    const isActive = selected?.id === m.id;
                    return (_jsxs("button", { onClick: () => onSelect(m), className: [
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                            isActive ? "bg-accent/20 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                        ].join(" "), children: [_jsx("span", { className: "text-xl", children: SCIENTIST_EMOJI[m.name] ?? "🧪" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium truncate", children: m.name }), _jsx("p", { className: "text-xs text-slate-500", children: meta.label })] }), _jsx(ChevronRight, { size: 13, className: "shrink-0 text-slate-600" })] }, m.id));
                }) }))] }));
}
function MemberDetail({ member }) {
    const meta = ROLE_META[member.role] ?? ROLE_META["researcher"];
    const { Icon } = meta;
    const persona = member.persona;
    return (_jsxs("div", { className: "max-w-2xl", children: [_jsxs("div", { className: "flex items-center gap-5 mb-8", children: [_jsx("div", { className: `w-20 h-20 rounded-2xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-4xl shadow-lg`, children: SCIENTIST_EMOJI[member.name] ?? "🧪" }), _jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-white", children: member.name }), _jsxs("div", { className: "flex items-center gap-2 mt-1", children: [_jsx(Icon, { size: 14, className: "text-slate-400" }), _jsx("span", { className: "text-sm text-slate-400", children: meta.label }), _jsx("span", { className: "w-1 h-1 rounded-full bg-slate-600" }), _jsx("span", { className: `text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r ${meta.color} text-white`, children: member.role.toUpperCase() })] })] })] }), !!persona.description && (_jsx(Card, { title: "About", children: _jsx("p", { className: "text-sm text-slate-300 leading-relaxed", children: String(persona.description) }) })), Array.isArray(persona.strengths) && persona.strengths.length > 0 && (_jsx(Card, { title: "Strengths", children: _jsx("div", { className: "flex flex-wrap gap-2", children: persona.strengths.map(s => (_jsx("span", { className: "text-xs px-2.5 py-1 rounded-full bg-white/8 text-slate-300 border border-white/10", children: s }, s))) }) })), Array.isArray(persona.domain_keywords) && persona.domain_keywords.length > 0 && (_jsx(Card, { title: "Domain Keywords", children: _jsx("div", { className: "flex flex-wrap gap-2", children: persona.domain_keywords.map(k => (_jsx("span", { className: `text-xs px-2.5 py-1 rounded-full bg-gradient-to-r ${meta.color} bg-opacity-20 text-white`, children: k }, k))) }) })), Array.isArray(persona.constraints) && persona.constraints.length > 0 && (_jsx(Card, { title: "Operating Principles", children: _jsx("ul", { className: "space-y-1.5", children: persona.constraints.map(c => (_jsxs("li", { className: "text-xs text-slate-400 flex gap-2", children: [_jsx("span", { className: "text-accent mt-0.5", children: "\u2022" }), c] }, c))) }) })), !!persona.communication_style && (_jsx(Card, { title: "Communication Style", children: _jsxs("p", { className: "text-sm text-slate-300 italic", children: ["\"", String(persona.communication_style), "\""] }) }))] }));
}
function Card({ title, children }) {
    return (_jsxs("div", { className: "mb-5 rounded-xl border border-white/8 bg-surface-800 p-5", children: [_jsx("h3", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3", children: title }), children] }));
}
