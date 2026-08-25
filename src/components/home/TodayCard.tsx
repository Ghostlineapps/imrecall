"use client";

import { useState } from "react";
import useSWR from "swr";
import { MapPin, Clock, CalendarClock, Plane, Users, Sparkles, ThumbsUp, ThumbsDown } from "lucide-react";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ICONS: Record<string, typeof Clock> = {
  on_this_day: Clock,
  proximity: MapPin,
  deadline: CalendarClock,
  pre_trip: Plane,
  people: Users,
  manual_recall: Sparkles,
};

/**
 * Mostra un solo candidato di resurfacing per volta — quello con il
 * priority_score più alto calcolato server-side (recency + urgenza +
 * rilevanza). Vedi la tabella resurface_candidates e la logica in
 * /api/insights/today/route.ts.
 *
 * Feedback: due pulsanti (utile/non utile) scrivono sulla colonna
 * `feedback` di resurface_candidates (migrazione 023) tramite
 * /api/insights/[id]/feedback. Non cambia ancora priority_score — nessuna
 * logica di apprendimento oggi — ma senza questo segnale non sapremmo mai
 * se il resurfacing sta funzionando o solo infastidendo, prima di investire
 * in uno scoring più sofisticato.
 */
export function TodayCard() {
  const { data, isLoading } = useSWR("/api/insights/today", fetcher);
  const [reacted, setReacted] = useState<"useful" | "not_useful" | null>(null);
  const [sending, setSending] = useState(false);

  if (isLoading) {
    return <div className="card-light h-32 animate-pulse bg-celeste-navy/5" />;
  }

  if (!data?.candidate) {
    return (
      <div className="card-light text-center py-8 text-celeste-muted">
        <p className="text-sm">
          Ancora nessun ricordo da riproporti oggi. Inizia a catturare
          qualcosa qui sotto — torneremo a mostrartelo al momento giusto.
        </p>
      </div>
    );
  }

  const { id, type, title, body, memory_id } = data.candidate;
  const Icon = ICONS[type] ?? Sparkles;

  async function sendFeedback(value: "useful" | "not_useful") {
    if (sending || reacted) return;
    // Aggiornamento ottimistico: la reazione risponde subito, il giro di
    // rete non blocca l'interazione.
    setSending(true);
    setReacted(value);
    try {
      await fetch(`/api/insights/${id}/feedback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: value }),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-light space-y-2 border-celeste-accent/25 bg-gradient-to-br from-celeste-accent/10 to-transparent animate-fade-in">
      <Link href={memory_id ? `/memory/${memory_id}` : "#"} className="block space-y-2">
        <div className="flex items-center gap-2 text-celeste-accentDark text-xs font-medium">
          <Icon size={14} />
          <span>{labelFor(type)}</span>
        </div>
        <p className="font-medium leading-snug text-celeste-navy">{title}</p>
        <p className="text-sm text-celeste-muted leading-relaxed">{body}</p>
      </Link>

      {reacted ? (
        <p className="text-xs text-celeste-muted pt-1">
          {reacted === "useful" ? "Bene, grazie del feedback." : "Capito, ne terremo conto."}
        </p>
      ) : (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => sendFeedback("useful")}
            className="flex items-center gap-1 text-xs text-celeste-muted hover:text-celeste-accentDark transition-colors"
            aria-label="Utile"
          >
            <ThumbsUp size={13} /> Utile
          </button>
          <button
            onClick={() => sendFeedback("not_useful")}
            className="flex items-center gap-1 text-xs text-celeste-muted hover:text-urgent transition-colors"
            aria-label="Non utile"
          >
            <ThumbsDown size={13} /> Non utile
          </button>
        </div>
      )}
    </div>
  );
}

function labelFor(type: string) {
  switch (type) {
    case "on_this_day":
      return "Accadde oggi";
    case "proximity":
      return "Sei di nuovo qui";
    case "deadline":
      return "Scadenza in arrivo";
    case "pre_trip":
      return "Prima di partire";
    case "people":
      return "Ti ricordi di loro?";
    default:
      return "Da ricordare";
  }
}
