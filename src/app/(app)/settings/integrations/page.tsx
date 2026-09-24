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

// 2026-08-26: palette celeste (tredicesima schermata convertita).
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

  // Collegamento Telegram (migration 038) — a differenza di Google/
  // Microsoft, non c'è un OAuth redirect: generiamo un codice monouso che
  // l'utente manda al bot con "/start <codice>" (vedi /api/telegram/link e
  // /api/telegram/webhook), quindi lo stato "connesso" arriva da
  // /api/profile invece che da una route di status dedicata.
  const [telegramConnected, setTelegramConnected] = useState<boolean | null>(null);
  const [telegramCode, setTelegramCode] = useState<{ code: string; deep_link: string | null } | null>(null);
  const [telegramGenerating, setTelegramGenerating] = useState(false);
  const [telegramDisconnecting, setTelegramDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => setTelegramConnected(!!data.telegram_connected))
      .catch(() => {});
  }, []);

  async function generateTelegramCode() {
    setTelegramGenerating(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (res.ok) setTelegramCode({ code: data.code, deep_link: data.deep_link });
    } finally {
      setTelegramGenerating(false);
    }
  }

  async function disconnectTelegram() {
    setTelegramDisconnecting(true);
    try {
      await fetch("/api/telegram/unlink", { method: "POST" });
      setTelegramConnected(false);
      setTelegramCode(null);
    } finally {
      setTelegramDisconnecting(false);
    }
  }

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
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <h1 className="text-xl font-semibold">Integrazioni</h1>

      {googleBanner === "connected" && (
        <div className="card-light space-y-1 border border-green-500/30">
          <p className="text-sm">Gmail collegato con successo.</p>
        </div>
      )}
      {googleBanner === "error" && (
        <div className="card-light space-y-1">
          <p className="text-urgent text-sm">
            Collegamento Gmail non riuscito. Se hai annullato l&apos;autorizzazione su Google va
            bene così, altrimenti riprova tra poco.
          </p>
        </div>
      )}
      {microsoftBanner === "connected" && (
        <div className="card-light space-y-1 border border-green-500/30">
          <p className="text-sm">Outlook collegato con successo.</p>
        </div>
      )}
      {microsoftBanner === "error" && (
        <div className="card-light space-y-1">
          <p className="text-urgent text-sm">
            Collegamento Outlook non riuscito. Se hai annullato l&apos;autorizzazione su Microsoft
            va bene così, altrimenti riprova tra poco.
          </p>
        </div>
      )}

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Gmail</p>
          <p className="text-sm text-celeste-muted mt-1">
            Quando arriva un&apos;email che propone una riunione, una videocall o una
            prenotazione, IMRECALL la rileva automaticamente e crea l&apos;appuntamento — sia qui
            nell&apos;app, sia sul tuo Google Calendar.
          </p>
        </div>

        {googleLoading && <p className="text-sm text-celeste-muted">Verifica collegamento…</p>}

        {!googleLoading && googleData?.connected && (
          <>
            <p className="text-sm text-celeste-muted">
              Collegato come <span className="text-celeste-navy/80">{googleData.google_email}</span>
            </p>
            <button onClick={disconnectGoogle} disabled={disconnectingGoogle} className="btn-ghost-light w-full">
              {disconnectingGoogle ? "Scollegamento…" : "Scollega Gmail"}
            </button>
          </>
        )}

        {!googleLoading && !googleData?.connected && (
          <a href="/api/integrations/google/connect" className="btn-primary-light w-full block text-center">
            Connetti Gmail
          </a>
        )}

        <p className="text-xs text-celeste-muted">
          Leggiamo solo le email in arrivo per riconoscere impegni con data e ora — non
          modifichiamo né cancelliamo nulla nella tua casella. Puoi scollegare in qualsiasi
          momento.
        </p>
      </div>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Outlook</p>
          <p className="text-sm text-celeste-muted mt-1">
            Stessa cosa, ma per la posta Outlook/Hotmail: riunioni, videocall e prenotazioni
            rilevate automaticamente e aggiunte come appuntamento — sia qui nell&apos;app, sia sul
            tuo Outlook Calendar.
          </p>
        </div>

        {microsoftLoading && <p className="text-sm text-celeste-muted">Verifica collegamento…</p>}

        {!microsoftLoading && microsoftData?.connected && (
          <>
            <p className="text-sm text-celeste-muted">
              Collegato come <span className="text-celeste-navy/80">{microsoftData.microsoft_email}</span>
            </p>
            <button
              onClick={disconnectMicrosoft}
              disabled={disconnectingMicrosoft}
              className="btn-ghost-light w-full"
            >
              {disconnectingMicrosoft ? "Scollegamento…" : "Scollega Outlook"}
            </button>
          </>
        )}

        {!microsoftLoading && !microsoftData?.connected && (
          <a href="/api/integrations/microsoft/connect" className="btn-primary-light w-full block text-center">
            Connetti Outlook
          </a>
        )}

        <p className="text-xs text-celeste-muted">
          Leggiamo solo le email in arrivo per riconoscere impegni con data e ora — non
          modifichiamo né cancelliamo nulla nella tua casella. Puoi scollegare in qualsiasi
          momento.
        </p>
      </div>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Telegram</p>
          <p className="text-sm text-celeste-muted mt-1">
            Manda un messaggio o una nota vocale al bot ImRecall e la salviamo qui, esattamente
            come se l&apos;avessi registrata nell&apos;app — utile quando non vuoi aprire l&apos;app.
          </p>
        </div>

        {telegramConnected === null && <p className="text-sm text-celeste-muted">Verifica collegamento…</p>}

        {telegramConnected === true && (
          <>
            <p className="text-sm text-celeste-muted">Chat Telegram collegata.</p>
            <button
              onClick={disconnectTelegram}
              disabled={telegramDisconnecting}
              className="btn-ghost-light w-full"
            >
              {telegramDisconnecting ? "Scollegamento…" : "Scollega Telegram"}
            </button>
          </>
        )}

        {telegramConnected === false && !telegramCode && (
          <button onClick={generateTelegramCode} disabled={telegramGenerating} className="btn-primary-light w-full">
            {telegramGenerating ? "Genero il codice…" : "Connetti Telegram"}
          </button>
        )}

        {telegramConnected === false && telegramCode && (
          <div className="space-y-2">
            <p className="text-sm text-celeste-muted">
              Apri la chat con il bot e manda:{" "}
              <span className="font-mono text-celeste-navy">/start {telegramCode.code}</span>
            </p>
            {telegramCode.deep_link && (
              <a href={telegramCode.deep_link} target="_blank" rel="noreferrer" className="btn-primary-light w-full block text-center">
                Apri Telegram
              </a>
            )}
            <p className="text-xs text-celeste-muted">Il codice scade tra 10 minuti.</p>
          </div>
        )}

        <p className="text-xs text-celeste-muted">
          Leggiamo solo i messaggi che mandi tu al bot. Puoi scollegare in qualsiasi momento.
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
