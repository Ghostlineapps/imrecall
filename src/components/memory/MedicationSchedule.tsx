"use client";

import useSWR from "swr";
import { Check } from "lucide-react";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Mostrata nel dettaglio del ricordo-farmaco, così chi tocca la notifica
// push ("Prendi il Bivis") può confermare la dose direttamente da lì,
// senza dover tornare in Dashboard. Stessa fonte dati (e stessa cache SWR)
// del widget "Farmaci di oggi" — vedi MedicationsTodayCard.tsx.
export function MedicationSchedule({ memoryId }: { memoryId: string }) {
  const { data, mutate } = useSWR("/api/medications/today", fetcher);
  const entries = (data?.schedule ?? []).filter((s: any) => s.memory_id === memoryId);

  if (entries.length === 0) return null;

  async function toggle(medicationId: string, time: string, taken: boolean) {
    mutate(
      (current: any) => ({
        ...current,
        schedule: (current?.schedule ?? []).map((s: any) =>
          s.medication_id === medicationId && s.time === time ? { ...s, taken: !taken } : s
        ),
      }),
      { revalidate: false }
    );

    await fetch(`/api/medications/${medicationId}/take`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time, taken: !taken }),
    });

    mutate();
  }

  return (
    <div className="card space-y-1.5">
      <p className="text-xs text-white/50 font-medium mb-1">Dosi di oggi</p>
      {entries.map((s: any) => (
        <button
          key={s.time}
          onClick={() => toggle(s.medication_id, s.time, s.taken)}
          className="flex items-center gap-3 w-full text-left py-1"
        >
          <span
            className={clsx(
              "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
              s.taken ? "bg-primary border-primary" : "border-white/25"
            )}
          >
            {s.taken && <Check size={12} className="text-white" />}
          </span>
          <span className={clsx("text-sm flex-1", s.taken ? "text-white/40 line-through" : "text-white/85")}>
            {s.time}
          </span>
          <span className="text-xs text-white/40">{s.taken ? "Presa" : "Da prendere"}</span>
        </button>
      ))}
    </div>
  );
}
