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

export function PendingUploadsIndicator() {
  const items = useCaptureQueueStore((s) => s.items);
  if (items.length === 0) return null;

  const uploading = items.some((i) => i.status === "uploading");

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="flex items-center gap-2 bg-surface border border-white/10 rounded-full px-4 py-2 shadow-lg text-sm text-white/80">
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
        <span>
          {items.length === 1
            ? "1 registrazione in coda di caricamento"
            : `${items.length} registrazioni in coda di caricamento`}
        </span>
      </div>
    </div>
  );
}
