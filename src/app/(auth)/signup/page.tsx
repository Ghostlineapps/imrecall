"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3 animate-fade-in">
          <h1 className="text-2xl font-semibold">Controlla la tua email</h1>
          <p className="text-white/60">
            Ti abbiamo mandato un link per confermare l&apos;account e iniziare a
            usare IMRECALL.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold">Crea il tuo account</h1>
          <p className="text-white/50 text-sm mt-1">
            La tua memoria, sempre con te.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            placeholder="Come ti chiami?"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input-field"
          />
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
            minLength={8}
            placeholder="Password (min. 8 caratteri)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
          {error && <p className="text-urgent text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Creazione in corso…" : "Crea account"}
          </button>
        </form>

        <p className="text-center text-sm text-white/50">
          Hai già un account?{" "}
          <Link href="/login" className="text-primary-light">
            Accedi
          </Link>
        </p>
      </div>
    </main>
  );
}
