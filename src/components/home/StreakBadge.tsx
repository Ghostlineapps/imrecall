import { Flame } from "lucide-react";

/**
 * Lo streak è agganciato all'azione che genera valore (catturare una
 * memoria), non al semplice aprire l'app — altrimenti diventa una vanity
 * metric che non guida il comportamento giusto.
 *
 * Stile pensato per stare sul blocco di benvenuto in cima alla Dashboard
 * (sfondo sfumato celeste, non più bianco/chiaro): bianco traslucido invece
 * di bg-warn/10, altrimenti sparirebbe sullo sfondo colorato. La fiamma
 * resta ambra per il contrasto caldo/freddo — l'unico tocco di colore che
 * spicca nel resto della palette blu.
 */
export function StreakBadge({ days }: { days: number }) {
  if (days < 2) return null;

  return (
    <div className="flex items-center gap-1 bg-white/20 text-white backdrop-blur-sm border border-white/25 px-3 py-1.5 rounded-full text-sm font-semibold shrink-0">
      <Flame size={14} className="text-amber-300" fill="currentColor" />
      {days}
    </div>
  );
}
