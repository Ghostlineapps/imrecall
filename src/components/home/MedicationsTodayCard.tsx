"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Pill, Check, BellOff } from "lucide-react";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Le dosi di oggi (una per farmaco attivo e orario) con lo stato
// preso/da prendere — la spunta funziona sia prima che dopo l'arrivo della
// notifica push mandata da /api/cron/medications, quindi non serve
// aspettare la notifica per confermare una dose.
export function MedicationsTodayCard() {
  const { data, isLoading, mutate } = useSWR("/api/medications/today", fetcher);
  const schedule = data?.schedule ?? [];

  // Le notifiche push dei farmaci condividono un unico interruttore globale
  // (Impostazioni → Notifiche) con le altre notifiche dell'app: se è spento
  // — o se il permesso del browser è stato revocato senza che l'utente se ne
  // accorga (capita su iOS dopo un reinstall della PWA) — il promemoria non
  // arriva mai, in silenzio, senza nessun errore da nessuna parte. Lo
  // segnaliamo qui, dove l'utente vede davvero i farmaci di oggi, invece di
  // lasciare che se ne accorga solo aprendo le impostazioni per caso.
  // Parte da `true` per non far lampeggiare l'avviso mentre il controllo è
  // ancora in corso.
  const [pushEnabled, setPushEnabled] = useState(true);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setPushEnabled(!!sub && Notification.permission === "granted");
      })
      .catch(() => {});
  }, []);

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

      {!isLoading && schedule.length > 0 && !pushEnabled && (
        <Link
          href="/settings/notifications"
          className="flex items-start gap-2 rounded-xl bg-urgent/10 border border-urgent/20 px-3 py-2 text-xs text-urgent"
        >
          <BellOff size={14} className="shrink-0 mt-0.5" />
          <span>
            Le notifiche push sono disattivate: non riceverai il promemoria per questi farmaci.
            Attivale nelle impostazioni.
          </span>
        </Link>
      )}

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
