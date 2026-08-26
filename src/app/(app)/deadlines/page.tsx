"use client";

import useSWR from "swr";
import { differenceInDays } from "date-fns";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DeadlinesPage() {
  const { data, isLoading, mutate } = useSWR("/api/deadlines", fetcher);

  async function markComplete(id: string) {
    await fetch(`/api/deadlines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    mutate();
  }

  const deadlines = (data?.deadlines ?? []).sort(
    (a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );

  return (
    // Palette celeste (redesign 2026-08-21/26, sesta schermata convertita):
    // stessa struttura di prima, solo colori. Le fasce urgent/warn restano
    // gli stessi colori semantici (rosso/ambra), non fanno parte della
    // palette del tema e quindi non cambiano tra scuro e chiaro.
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-4 text-celeste-navy">
      <h1 className="text-xl font-semibold">Scadenze</h1>
      <p className="text-celeste-muted text-sm">
        Fotografa un documento nella barra qui sotto — riconosciamo la data automaticamente.
      </p>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="card-light h-16 animate-pulse bg-celeste-navy/5" />)}
        </div>
      )}

      {!isLoading && deadlines.length === 0 && (
        <p className="text-celeste-muted text-sm py-8 text-center">Nessuna scadenza registrata.</p>
      )}

      <div className="space-y-2">
        {deadlines.map((d: any) => {
          const daysUntil = differenceInDays(new Date(d.due_date), new Date());
          const urgency = daysUntil < 7 ? "urgent" : daysUntil < 30 ? "warn" : "neutral";

          return (
            <div key={d.id} className="card-light flex items-center gap-3">
              <button onClick={() => markComplete(d.id)} className="text-celeste-navy/25 hover:text-green-600 transition-colors">
                <CheckCircle2 size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.title}</p>
                <p className="text-xs text-celeste-muted">
                  {format(new Date(d.due_date), "d MMMM yyyy", { locale: it })} · {d.category}
                </p>
              </div>
              <span
                className={clsx(
                  "text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap",
                  urgency === "urgent" && "bg-urgent/15 text-urgent",
                  urgency === "warn" && "bg-warn/15 text-warn",
                  urgency === "neutral" && "bg-celeste-navy/5 text-celeste-muted"
                )}
              >
                {daysUntil < 0 ? "scaduta" : `tra ${daysUntil}gg`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
