"use client";

import { Share2 } from "lucide-react";

// Bottone icona riutilizzabile per condividere una singola sezione (riassunto,
// trascrizione, mappa mentale, audio) tramite il pannello nativo del
// dispositivo — vedi src/lib/share.ts per l'implementazione della condivisione.
// className di default pensato per le card chiare (.card-light); le card
// scure superstiti (es. la mappa legacy in MindMap.tsx) passano una variante
// chiara altrimenti l'icona sparirebbe sullo sfondo scuro.
export function ShareButton({
  onShare,
  label,
  className = "text-celeste-navy/35 hover:text-celeste-navy/70",
}: {
  onShare: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={label}
      title={label}
      className={`${className} transition-colors shrink-0 p-0.5 -m-0.5`}
    >
      <Share2 size={15} />
    </button>
  );
}
