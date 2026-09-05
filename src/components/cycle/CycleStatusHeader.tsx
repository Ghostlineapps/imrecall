"use client";

import { CalendarClock } from "lucide-react";

type CycleStatus = {
  cycleDay: number | null;
  phase: "mestruazione" | "follicolare" | "ovulazione" | "luteale" | null;
  nextPeriod: { date: string; rangeStartDate: string; rangeEndDate: string; confidence: "bassa" | "media" | "alta" } | null;
  fertileWindow: { startDate: string; endDate: string; ovulationDate: string } | null;
};

const PHASE_STYLES: Record<
  NonNullable<CycleStatus["phase"]>,
  { label: string; bg: string; text: string }
> = {
  mestruazione: { label: "Mestruazioni", bg: "bg-rose-500/10", text: "text-rose-600" },
  follicolare: { label: "Fase follicolare", bg: "bg-celeste-accent/10", text: "text-celeste-accentDark" },
  ovulazione: { label: "Ovulazione probabile", bg: "bg-amber-500/10", text: "text-amber-600" },
  luteale: { label: "Fase luteale", bg: "bg-violet-500/10", text: "text-violet-600" },
};

function formatDayIt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

// L'onestà sulla previsione è deliberata: con pochi cicli osservati
// mostriamo un range ampio e diciamo perché, invece di una data secca che
// poi si rivela sbagliata — è la causa più comune di sfiducia in questo
// tipo di app quando la previsione sbaglia con sicurezza.
const CONFIDENCE_NOTE: Record<"bassa" | "media" | "alta", string> = {
  bassa: "Ancora pochi cicli registrati: la previsione è indicativa.",
  media: "Previsione basata sui tuoi ultimi cicli.",
  alta: "Previsione affidabile, basata su diversi cicli registrati.",
};

export function CycleStatusHeader({ status }: { status: CycleStatus }) {
  if (!status.phase || !status.cycleDay || !status.nextPeriod) return null;
  const style = PHASE_STYLES[status.phase];

  return (
    <div className="card-light space-y-3 bg-gradient-to-br from-celeste-accent/10 to-transparent">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>{style.label}</span>
        <span className="text-xs text-celeste-muted">Giorno {status.cycleDay} del ciclo</span>
      </div>

      <div className="flex items-start gap-2.5">
        <CalendarClock size={18} className="text-celeste-accentDark mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-celeste-navy">
            Prossimo ciclo previsto tra il <strong>{formatDayIt(status.nextPeriod.rangeStartDate)}</strong> e il{" "}
            <strong>{formatDayIt(status.nextPeriod.rangeEndDate)}</strong>
          </p>
          <p className="text-xs text-celeste-muted mt-0.5">{CONFIDENCE_NOTE[status.nextPeriod.confidence]}</p>
        </div>
      </div>

      {status.phase === "ovulazione" && status.fertileWindow && (
        <p className="text-xs text-amber-700 bg-amber-500/10 rounded-lg px-3 py-2">
          Finestra fertile stimata: {formatDayIt(status.fertileWindow.startDate)} –{" "}
          {formatDayIt(status.fertileWindow.endDate)}
        </p>
      )}
    </div>
  );
}
