// src/components/capture/PendingUploadsIndicator.tsx
//
// Piccolo indicatore fisso in alto: mostra quante registrazioni sono
// ancora in coda di caricamento (salvate ma non ancora confermate dal
// server). Invisibile quando la coda è vuota — non deve disturbare l'uso
// normale, serve solo a rassicurare l'utente che una registrazione fatta
// offline non è andata persa.

"use client";

import { useCaptureQueueStore } from "@/stores/captureQueueStore";
import { Loader2, CloudUpload } from "lucide-react";

// 2026-09-17: dopo 3 tentativi falliti (~90s, vedi il retry ogni 30s in
// useCaptureQueueSync) mostriamo anche il dettaglio tecnico reale
// (item.lastError, ora popolato con la causa vera grazie a
// UploadError.technicalDetail — vedi uploadCapture.ts) invece di lasciare
// l'utente con solo "in coda di caricamento" senza mai capire perché. Sotto
// i 3 tentativi resta nascosto: un singolo fallimento transitorio è normale
// e non merita di allarmare con un messaggio tecnico.
const ATTEMPTS_BEFORE_SHOWING_DETAIL = 3;

export function PendingUploadsIndicator() {
  const items = useCaptureQueueStore((s) => s.items);
  if (items.length === 0) return null;

  const uploading = items.some((i) => i.status === "uploading");
  const stuck = items.find((i) => i.attempts >= ATTEMPTS_BEFORE_SHOWING_DETAIL && i.lastError);

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 animate-fade-in flex flex-col items-center gap-1 max-w-[90vw]">
      <div className="flex items-center gap-2 bg-surface border border-white/10 rounded-full px-4 py-2 shadow-lg text-sm text-white/80">
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
        <span>
          {items.length === 1
            ? "1 registrazione in coda di caricamento"
            : `${items.length} registrazioni in coda di caricamento`}
        </span>
      </div>
      {stuck && (
        <div className="bg-surface border border-white/10 rounded-lg px-3 py-1.5 shadow-lg text-xs text-white/50 text-center">
          Continua a fallire dopo {stuck.attempts} tentativi: {stuck.lastError}
        </div>
      )}
    </div>
  );
}
