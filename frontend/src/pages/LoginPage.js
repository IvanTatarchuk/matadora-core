import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(false);
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err)
            setError(err.message);
        setLoading(false);
    };
    const handleMagicLink = async () => {
        if (!email) {
            setError("Enter your email first.");
            return;
        }
        setLoading(true);
        setError(null);
        const { error: err } = await supabase.auth.signInWithOtp({ email });
        if (err)
            setError(err.message);
        else
            setSent(true);
        setLoading(false);
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-surface-900 px-4", children: _jsxs("div", { className: "w-full max-w-sm space-y-6", children: [_jsxs("div", { className: "flex flex-col items-center gap-3", children: [_jsx("div", { className: "h-14 w-14 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center", children: _jsx(FlaskConical, { size: 28, className: "text-accent" }) }), _jsx("h1", { className: "text-2xl font-semibold tracking-tight text-slate-100", children: "Matadora Core" }), _jsx("p", { className: "text-sm text-slate-400", children: "Multi-agent research platform" })] }), _jsxs("form", { onSubmit: handleLogin, className: "card border p-6 space-y-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-xs font-medium text-slate-400", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true, placeholder: "you@example.com", className: "input" })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-xs font-medium text-slate-400", children: "Password" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", className: "input" })] }), error && (_jsx("p", { className: "text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2", children: error })), sent && (_jsx("p", { className: "text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2", children: "Magic link sent \u2014 check your email." })), _jsxs("div", { className: "flex flex-col gap-2 pt-1", children: [_jsx("button", { type: "submit", disabled: loading, className: "btn-primary w-full justify-center", children: loading ? _jsx(Loader2, { size: 15, className: "animate-spin" }) : "Sign in" }), _jsx("button", { type: "button", onClick: handleMagicLink, disabled: loading, className: "btn-ghost w-full justify-center text-xs", children: "Send magic link" })] })] })] }) }));
}
