"use client";

import useSWR from "swr";
import { MapPin, Clock, CalendarClock, Plane, Users, Sparkles } from "lucide-react";
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
 */
export function TodayCard() {
  const { data, isLoading } = useSWR("/api/insights/today", fetcher);

  if (isLoading) {
    return <div className="card h-32 animate-pulse bg-white/5" />;
  }

  if (!data?.candidate) {
    return (
      <div className="card text-center py-8 text-white/40">
        <p className="text-sm">
          Ancora nessun ricordo da riproporti oggi. Inizia a catturare
          qualcosa qui sotto — torneremo a mostrartelo al momento giusto.
        </p>
      </div>
    );
  }

  const { type, title, body, memory_id } = data.candidate;
  const Icon = ICONS[type] ?? Sparkles;

  return (
    <Link
      href={memory_id ? `/memory/${memory_id}` : "#"}
      className="card block space-y-2 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent animate-fade-in"
    >
      <div className="flex items-center gap-2 text-primary-light text-xs font-medium">
        <Icon size={14} />
        <span>{labelFor(type)}</span>
      </div>
      <p className="font-medium leading-snug">{title}</p>
      <p className="text-sm text-white/60 leading-relaxed">{body}</p>
    </Link>
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
