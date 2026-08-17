import { Flame } from "lucide-react";

/**
 * Lo streak è agganciato all'azione che genera valore (catturare una
 * memoria), non al semplice aprire l'app — altrimenti diventa una vanity
 * metric che non guida il comportamento giusto.
 */
export function StreakBadge({ days }: { days: number }) {
  if (days < 2) return null;

  return (
    <div className="flex items-center gap-1 bg-warn/10 text-warn px-3 py-1.5 rounded-full text-sm font-medium">
      <Flame size={14} fill="currentColor" />
      {days}
    </div>
  );
}
