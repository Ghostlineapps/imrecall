"use client";

import Link from "next/link";
import useSWR from "swr";
import { Droplet, ChevronRight } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PHASE_DOT: Record<string, string> = {
  mestruazione: "bg-rose-500",
  follicolare: "bg-celeste-accent",
  ovulazione: "bg-amber-500",
  luteale: "bg-violet-500",
};

const PHASE_LABEL: Record<string, string> = {
  mestruazione: "Mestruazioni",
  follicolare: "Fase follicolare",
  ovulazione: "Ovulazione probabile",
  luteale: "Fase luteale",
};

function formatDayIt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

/**
 * Card home per il ciclo, sullo stesso principio di MedicationsTodayCard:
 * un riepilogo minimo che rimanda alla pagina dedicata (/health/cycle) per
 * il dettaglio. A differenza dei farmaci, qui mostriamo qualcosa anche
 * prima dell'onboarding — un invito, non un vuoto — perché è proprio la
 * visibilità in home a portare all'uso frequente che era l'obiettivo di
 * questa funzione (vedi migrazione 031); nascondere la card finché
 * qualcuno non trova da solo /health/cycle vorrebbe dire non raggiungere
 * quell'obiettivo.
 */
export function CycleTodayCard() {
  const { data, isLoading } = useSWR("/api/cycle/status", fetcher);

  if (isLoading) return <div className="card-light h-16 animate-pulse bg-celeste-navy/5" />;

  const onboarded = !!data?.onboarded;
  const status = data?.status;

  if (!onboarded) {
    return (
      <Link href="/health/cycle" className="card-light flex items-center gap-3 hover:bg-celeste-navy/[0.02] transition-colors">
        <span className="w-9 h-9 rounded-full bg-celeste-accent/10 flex items-center justify-center shrink-0">
          <Droplet size={18} className="text-celeste-accentDark" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-celeste-navy">Traccia il tuo ciclo</p>
          <p className="text-xs text-celeste-muted mt-0.5">Previsioni e correlazioni con i tuoi ricordi.</p>
        </div>
        <ChevronRight size={18} className="text-celeste-muted shrink-0" />
      </Link>
    );
  }

  if (!status?.phase) return null;

  return (
    <Link href="/health/cycle" className="card-light flex items-center gap-3 hover:bg-celeste-navy/[0.02] transition-colors">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PHASE_DOT[status.phase]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-celeste-navy">{PHASE_LABEL[status.phase]}</p>
        {status.nextPeriod && (
          <p className="text-xs text-celeste-muted mt-0.5">
            Prossimo ciclo previsto dal {formatDayIt(status.nextPeriod.rangeStartDate)}
          </p>
        )}
      </div>
      <ChevronRight size={18} className="text-celeste-muted shrink-0" />
    </Link>
  );
}
