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
    <div className="px-4 pt-6 space-y-4">
      <h1 className="text-xl font-semibold">Scadenze</h1>
      <p className="text-white/40 text-sm">
        Fotografa un documento nella barra qui sotto — riconosciamo la data automaticamente.
      </p>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="card h-16 animate-pulse bg-white/5" />)}
        </div>
      )}

      {!isLoading && deadlines.length === 0 && (
        <p className="text-white/30 text-sm py-8 text-center">Nessuna scadenza registrata.</p>
      )}

      <div className="space-y-2">
        {deadlines.map((d: any) => {
          const daysUntil = differenceInDays(new Date(d.due_date), new Date());
          const urgency = daysUntil < 7 ? "urgent" : daysUntil < 30 ? "warn" : "neutral";

          return (
            <div key={d.id} className="card flex items-center gap-3">
              <button onClick={() => markComplete(d.id)} className="text-white/20 hover:text-green-400 transition-colors">
                <CheckCircle2 size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.title}</p>
                <p className="text-xs text-white/40">
                  {format(new Date(d.due_date), "d MMMM yyyy", { locale: it })} · {d.category}
                </p>
              </div>
              <span
                className={clsx(
                  "text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap",
                  urgency === "urgent" && "bg-urgent/15 text-urgent",
                  urgency === "warn" && "bg-warn/15 text-warn",
                  urgency === "neutral" && "bg-white/5 text-white/40"
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
