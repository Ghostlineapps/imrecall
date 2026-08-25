"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Status = {
  connected: boolean;
  google_email?: string;
  microsoft_email?: string;
  connected_at?: string;
  last_synced_at?: string;
};

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const {
    data: googleData,
    mutate: mutateGoogle,
    isLoading: googleLoading,
  } = useSWR<Status>("/api/integrations/google/status", fetcher);
  const {
    data: microsoftData,
    mutate: mutateMicrosoft,
    isLoading: microsoftLoading,
  } = useSWR<Status>("/api/integrations/microsoft/status", fetcher);

  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [disconnectingMicrosoft, setDisconnectingMicrosoft] = useState(false);
  const [googleBanner, setGoogleBanner] = useState<"connected" | "error" | null>(null);
  const [microsoftBanner, setMicrosoftBanner] = useState<"connected" | "error" | null>(null);

  useEffect(() => {
    const google = searchParams.get("google");
    if (google === "connected" || google === "error") {
      setGoogleBanner(google);
      mutateGoogle();
    }
    const outlook = searchParams.get("outlook");
    if (outlook === "connected" || outlook === "error") {
      setMicrosoftBanner(outlook);
      mutateMicrosoft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnectGoogle() {
    setDisconnectingGoogle(true);
    try {
      await fetch("/api/integrations/google/disconnect", { method: "POST" });
      await mutateGoogle();
    } finally {
      setDisconnectingGoogle(false);
    }
  }

  async function disconnectMicrosoft() {
    setDisconnectingMicrosoft(true);
    try {
      await fetch("/api/integrations/microsoft/disconnect", { method: "POST" });
      await mutateMicrosoft();
    } finally {
      setDisconnectingMicrosoft(false);
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

      {googleBanner === "connected" && (
        <div className="card space-y-1 border border-green-500/30">
          <p className="text-sm">Gmail collegato con successo.</p>
        </div>
      )}
      {googleBanner === "error" && (
        <div className="card space-y-1">
          <p className="text-urgent text-sm">
            Collegamento Gmail non riuscito. Se hai annullato l&apos;autorizzazione su Google va
            bene così, altrimenti riprova tra poco.
          </p>
        </div>
      )}
      {microsoftBanner === "connected" && (
        <div className="card space-y-1 border border-green-500/30">
          <p className="text-sm">Outlook collegato con successo.</p>
        </div>
      )}
      {microsoftBanner === "error" && (
        <div className="card space-y-1">
          <p className="text-urgent text-sm">
            Collegamento Outlook non riuscito. Se hai annullato l&apos;autorizzazione su Microsoft
            va bene così, altrimenti riprova tra poco.
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

        {googleLoading && <p className="text-sm text-white/40">Verifica collegamento…</p>}

        {!googleLoading && googleData?.connected && (
          <>
            <p className="text-sm text-white/50">
              Collegato come <span className="text-white/80">{googleData.google_email}</span>
            </p>
            <button onClick={disconnectGoogle} disabled={disconnectingGoogle} className="btn-ghost w-full">
              {disconnectingGoogle ? "Scollegamento…" : "Scollega Gmail"}
            </button>
          </>
        )}

        {!googleLoading && !googleData?.connected && (
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

      <div className="card space-y-3">
        <div>
          <p className="font-medium">Outlook</p>
          <p className="text-sm text-white/50 mt-1">
            Stessa cosa, ma per la posta Outlook/Hotmail: riunioni, videocall e prenotazioni
            rilevate automaticamente e aggiunte come appuntamento — sia qui nell&apos;app, sia sul
            tuo Outlook Calendar.
          </p>
        </div>

        {microsoftLoading && <p className="text-sm text-white/40">Verifica collegamento…</p>}

        {!microsoftLoading && microsoftData?.connected && (
          <>
            <p className="text-sm text-white/50">
              Collegato come <span className="text-white/80">{microsoftData.microsoft_email}</span>
            </p>
            <button
              onClick={disconnectMicrosoft}
              disabled={disconnectingMicrosoft}
              className="btn-ghost w-full"
            >
              {disconnectingMicrosoft ? "Scollegamento…" : "Scollega Outlook"}
            </button>
          </>
        )}

        {!microsoftLoading && !microsoftData?.connected && (
          <a href="/api/integrations/microsoft/connect" className="btn-primary w-full block text-center">
            Connetti Outlook
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
