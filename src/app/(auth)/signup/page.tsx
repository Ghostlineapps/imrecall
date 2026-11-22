"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Richiesto 2026-11-22: prima non c'era alcun consenso esplicito ai
  // Termini/Privacy al momento della creazione account — i link esistevano
  // solo dentro Impostazioni, dopo che l'account era già attivo. Prima di
  // accettare pagamenti pubblicamente serve poter dimostrare un'accettazione
  // esplicita al momento della registrazione, non solo che il documento
  // esiste da qualche parte nell'app.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!acceptedTerms) {
      setError("Devi accettare i Termini di Servizio e la Privacy Policy per continuare.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // terms_accepted_at: prova della data/ora di accettazione esplicita,
        // richiesta sopra — finisce in user_metadata (auth.users.raw_user_meta_data).
        data: { full_name: fullName, terms_accepted_at: new Date().toISOString() },
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

  async function handleGoogleSignup() {
    if (!acceptedTerms) {
      setError("Devi accettare i Termini di Servizio e la Privacy Policy per continuare.");
      return;
    }
    setError(null);

    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
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
            La tua memoria, in orbita.
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              placeholder="Password (min. 8 caratteri)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              style={{ paddingRight: "2.75rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              aria-label={showPassword ? "Nascondi password" : "Mostra password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <label className="flex items-start gap-2 text-sm text-white/60">
            <input
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
            />
            <span>
              Accetto i{" "}
              <Link href="/terms" target="_blank" className="text-primary-light underline">
                Termini di Servizio
              </Link>{" "}
              e l&apos;
              <Link href="/privacy" target="_blank" className="text-primary-light underline">
                Informativa sulla Privacy
              </Link>
            </span>
          </label>

          {error && <p className="text-urgent text-sm">{error}</p>}
          <button type="submit" disabled={loading || !acceptedTerms} className="btn-primary w-full">
            {loading ? "Creazione in corso…" : "Crea account"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-white/30 text-xs">
          <div className="h-px bg-white/10 flex-1" />
          oppure
          <div className="h-px bg-white/10 flex-1" />
        </div>

        <button
          onClick={handleGoogleSignup}
          disabled={!acceptedTerms}
          className="w-full border border-white/10 rounded-full px-5 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continua con Google
        </button>

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
