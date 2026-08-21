"use client";

import useSWR from "swr";
import { Pill, Check } from "lucide-react";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Le dosi di oggi (una per farmaco attivo e orario) con lo stato
// preso/da prendere — la spunta funziona sia prima che dopo l'arrivo della
// notifica push mandata da /api/cron/medications, quindi non serve
// aspettare la notifica per confermare una dose.
export function MedicationsTodayCard() {
  const { data, isLoading, mutate } = useSWR("/api/medications/today", fetcher);

  const schedule = data?.schedule ?? [];

  if (!isLoading && schedule.length === 0) return null;

  async function toggle(medicationId: string, time: string, taken: boolean) {
    // Aggiornamento ottimistico: la spunta risponde subito, senza aspettare
    // il giro di rete — importante qui perché è un'azione ripetuta più
    // volte al giorno.
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
    <div className="card-light space-y-3">
      <div className="flex items-center gap-2 text-celeste-muted text-sm font-medium">
        <Pill size={16} />
        <span>Farmaci di oggi</span>
      </div>
      {isLoading ? (
        <div className="h-10 animate-pulse bg-celeste-navy/5 rounded-xl" />
      ) : (
        <div className="space-y-1.5">
          {schedule.map((s: any) => (
            <button
              key={`${s.medication_id}_${s.time}`}
              onClick={() => toggle(s.medication_id, s.time, s.taken)}
              className="flex items-center gap-3 w-full text-left py-1.5"
            >
              <span
                className={clsx(
                  "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                  s.taken ? "bg-celeste-accent border-celeste-accent" : "border-celeste-muted/40"
                )}
              >
                {s.taken && <Check size={12} className="text-white" />}
              </span>
              <span className={clsx("text-sm flex-1", s.taken ? "text-celeste-muted line-through" : "text-celeste-navy")}>
                {s.name}
                {s.dose ? ` — ${s.dose}` : ""}
              </span>
              <span className="text-xs text-celeste-muted">{s.time}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
