"use client";

// Errore catturato a livello di root layout (quando anche l'html/body
// principale fallisce a renderizzare). Aggiunto il 2026-09-14 dopo che un
// utente ha visto "Application error: a client-side exception has occurred"
// aprendo la PWA dalla schermata Home subito dopo un deploy: senza un error
// boundary, un bundle JS in cache che punta a chunk ormai sostituiti sul
// server mandava in crash l'intera app senza modo di uscirne. Qui rileviamo
// questo caso specifico (ChunkLoadError / import dinamico fallito) e
// ricarichiamo la pagina automaticamente una sola volta; per qualsiasi altro
// errore mostriamo un fallback con un pulsante "Ricarica".
import { useEffect } from "react";

function isStaleChunkError(error: Error) {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\d]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  );
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !isStaleChunkError(error)) return;
    const key = "imrecall_stale_chunk_reload_at";
    const last = Number(sessionStorage.getItem(key) || 0);
    const now = Date.now();
    // Evita un loop infinito di reload se il problema dovesse persistere davvero.
    if (now - last > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
          background: "#0b0f14",
          color: "#ffffff",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 8, letterSpacing: 1 }}>
          IMRECALL
        </p>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Qualcosa non ha funzionato
        </h1>
        <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 320, marginBottom: 24 }}>
          Prova a ricaricare la pagina. Se il problema continua, chiudi
          completamente l&apos;app dalle app recenti e riaprila.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#635bff",
            color: "#ffffff",
            border: "none",
            borderRadius: 999,
            padding: "12px 28px",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Ricarica
        </button>
      </body>
    </html>
  );
}
