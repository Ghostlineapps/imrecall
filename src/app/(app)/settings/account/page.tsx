"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Cancellazione account self-service — richiesta 2026-11-22. Prima l'unico
// modo per chiudere l'account era scrivere a info@axistpl.hk (vedi
// src/app/terms/page.tsx, sezione "Sospensione e cessazione dell'account"):
// non più sostenibile con traffico pubblico reale, ed è anche uno dei campi
// del form Data Safety di Google Play (possibilità di richiedere la
// cancellazione dei dati). La logica di cancellazione vera e propria è in
// src/app/api/user/account/route.ts — qui solo la UI di conferma.
const CONFIRM_WORD = "ELIMINA";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/user/account", { method: "DELETE" });
      if (!res.ok) {
        setError("Non siamo riusciti a cancellare l'account. Riprova, o scrivi a info@axistpl.hk.");
        setDeleting(false);
        return;
      }
      // L'account (e la sessione server-side) non esistono più a questo
      // punto: signOut qui ripulisce solo lo stato locale del client.
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login?account_deleted=1");
    } catch {
      setError("Non siamo riusciti a cancellare l'account. Riprova, o scrivi a info@axistpl.hk.");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-10 space-y-6 text-celeste-navy">
      <div>
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        {email && <p className="text-sm text-celeste-muted mt-1">{email}</p>}
      </div>

      <div className="card-light space-y-3 border-urgent/20">
        <p className="font-medium text-urgent">Zona pericolosa</p>

        {!confirming ? (
          <>
            <p className="text-sm text-celeste-muted">
              Cancella definitivamente il tuo account IMRECALL: ricordi, farmaci, promemoria,
              luoghi salvati e collegamenti a Gmail/Outlook vengono eliminati, ed eventuali
              abbonamenti Premium attivi disdetti. L&apos;operazione non si può annullare.
            </p>
            <button onClick={() => setConfirming(true)} className="text-sm text-urgent font-medium">
              Elimina account…
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-celeste-muted">
              Per confermare, scrivi <strong className="text-celeste-navy">{CONFIRM_WORD}</strong>{" "}
              qui sotto. Questa azione è definitiva: non potrai recuperare i tuoi ricordi dopo
              averla confermata.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              disabled={deleting}
              className="input-field-light"
              autoFocus
            />
            {error && <p className="text-urgent text-sm">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelete}
                disabled={confirmText !== CONFIRM_WORD || deleting}
                className="bg-urgent hover:brightness-110 text-white font-medium rounded-full px-5 py-2.5 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {deleting ? "Eliminazione in corso…" : "Elimina definitivamente"}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={deleting}
                className="btn-ghost-light text-sm"
              >
                Annulla
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
