"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Status = {
  connected: boolean;
  google_email?: string;
  connected_at?: string;
  last_synced_at?: string;
};

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const { data, mutate, isLoading } = useSWR<Status>("/api/integrations/google/status", fetcher);
  const [disconnecting, setDisconnecting] = useState(false);
  const [banner, setBanner] = useState<"connected" | "error" | null>(null);

  useEffect(() => {
    const google = searchParams.get("google");
    if (google === "connected" || google === "error") {
      setBanner(google);
      mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/google/disconnect", { method: "POST" });
      await mutate();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="px-4 pt-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-white/50 text-sm">
          ← Impostazioni
        </Link>
      </div>

      <h1 className="text-xl font-semibold">Integrazioni</h1>

      {banner === "connected" && (
        <div className="card space-y-1 border border-green-500/30">
          <p className="text-sm">Gmail collegato con successo.</p>
        </div>
      )}
      {banner === "error" && (
        <div className="card space-y-1">
          <p className="text-urgent text-sm">
            Collegamento non riuscito. Se hai annullato l&apos;autorizzazione su Google va bene
            così, altrimenti riprova tra poco.
          </p>
        </div>
      )}

      <div className="card space-y-3">
        <div>
          <p className="font-medium">Gmail</p>
          <p className="text-sm text-white/50 mt-1">
            Quando arriva un&apos;email che propone una riunione, una videocall o una
            prenotazione, IMRECALL la rileva automaticamente e crea l&apos;appuntamento — sia qui
            nell&apos;app, sia sul tuo Google Calendar.
          </p>
        </div>

        {isLoading && <p className="text-sm text-white/40">Verifica collegamento…</p>}

        {!isLoading && data?.connected && (
          <>
            <p className="text-sm text-white/50">
              Collegato come <span className="text-white/80">{data.google_email}</span>
            </p>
            <button onClick={disconnect} disabled={disconnecting} className="btn-ghost w-full">
              {disconnecting ? "Scollegamento…" : "Scollega Gmail"}
            </button>
          </>
        )}

        {!isLoading && !data?.connected && (
          <a href="/api/integrations/google/connect" className="btn-primary w-full block text-center">
            Connetti Gmail
          </a>
        )}

        <p className="text-xs text-white/40">
          Leggiamo solo le email in arrivo per riconoscere impegni con data e ora — non
          modifichiamo né cancelliamo nulla nella tua casella. Puoi scollegare in qualsiasi
          momento.
        </p>
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsContent />
    </Suspense>
  );
}
