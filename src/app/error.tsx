"use client";

// Error boundary per gli errori catturati dentro l'albero delle route (non a
// livello di root layout, per quello vedi src/app/global-error.tsx). Stessa
// logica: se l'errore è dovuto a un bundle JS in cache che punta a chunk
// ormai sostituiti dopo un deploy, ricarichiamo automaticamente una volta
// sola; altrimenti mostriamo un fallback con un pulsante "Riprova".
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

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !isStaleChunkError(error)) return;
    const key = "imrecall_stale_chunk_reload_at";
    const last = Number(sessionStorage.getItem(key) || 0);
    const now = Date.now();
    if (now - last > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
        Qualcosa non ha funzionato
      </h1>
      <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 320, marginBottom: 20 }}>
        Prova a ricaricare. Se il problema continua, chiudi completamente
        l&apos;app dalle app recenti e riaprila.
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "#4C7EA0",
          color: "#ffffff",
          border: "none",
          borderRadius: 999,
          padding: "12px 28px",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Riprova
      </button>
    </div>
  );
}
