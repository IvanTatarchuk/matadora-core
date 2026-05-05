import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sent, setSent]       = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
  };

  const handleMagicLink = async () => {
    if (!email) { setError("Enter your email first."); return; }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email });
    if (err) setError(err.message);
    else setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center">
            <FlaskConical size={28} className="text-accent" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Matadora Core</h1>
          <p className="text-sm text-slate-400">Multi-agent research platform</p>
        </div>

        {/* Card */}
        <form onSubmit={handleLogin} className="card border p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {sent && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              Magic link sent — check your email.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? <Loader2 size={15} className="animate-spin" /> : "Sign in"}
            </button>
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              className="btn-ghost w-full justify-center text-xs"
            >
              Send magic link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
