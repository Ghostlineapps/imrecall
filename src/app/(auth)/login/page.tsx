"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError("Email o password non corretti.");
      return;
    }

    router.push(searchParams.get("next") || "/home");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold">Bentornato</h1>
          <p className="text-white/50 text-sm mt-1">Accedi a IMRECALL</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
          {error && <p className="text-urgent text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-white/30 text-xs">
          <div className="h-px bg-white/10 flex-1" />
          oppure
          <div className="h-px bg-white/10 flex-1" />
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full border border-white/10 rounded-full px-5 py-2.5 hover:bg-white/5 transition-colors"
        >
          Continua con Google
        </button>

        <p className="text-center text-sm text-white/50">
          Non hai un account?{" "}
          <Link href="/signup" className="text-primary-light">
            Registrati
          </Link>
        </p>
      </div>
    </main>
  );
}
