"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import clsx from "clsx";

const OPTIONS = [
  { label: "Tra 1 mese", days: 30 },
  { label: "Tra 6 mesi", days: 180 },
  { label: "Tra 1 anno", days: 365 },
];

/**
 * "Circle back" manuale: dà all'utente controllo esplicito oltre alla
 * classificazione AI automatica delle intenzioni — copre i casi in cui
 * l'AI non riconosce un'intenzione da sola.
 */
export function CircleBackButton({ memoryId }: { memoryId: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function schedule(label: string, days: number) {
    const recallAt = new Date();
    recallAt.setDate(recallAt.getDate() + days);

    await fetch("/api/intentions/recall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory_id: memoryId, recall_at: recallAt.toISOString(), recall_label: label }),
    });

    setSaved(label);
    setOpen(false);
  }

  if (saved) {
    return (
      <p className="text-sm text-white/40 flex items-center gap-1.5">
        <Bell size={14} /> Te lo ricorderemo {saved.toLowerCase()}
      </p>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-white/50 flex items-center gap-1.5 hover:text-white transition-colors"
      >
        <Bell size={14} /> Ricordamelo tra…
      </button>

      {open && (
        <div className="absolute z-10 mt-2 card flex flex-col gap-1 animate-fade-in">
          {OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={() => schedule(o.label, o.days)}
              className={clsx("text-left text-sm px-3 py-2 rounded-lg hover:bg-white/5")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
