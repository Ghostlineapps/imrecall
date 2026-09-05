"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const WEEKDAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];

type CycleLog = { log_date: string; flow: string | null };

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/**
 * Calendario mensile: giorni con mestruazioni registrate in rosso pieno,
 * finestra fertile prevista in ambra, range del prossimo ciclo previsto in
 * rosso tratteggiato — tre informazioni diverse, tre trattamenti visivi
 * diversi, per non doverli leggere in una legenda a parte. Tap su un
 * giorno apre il log di quel giorno (onSelectDay), utile sia per registrare
 * oggi sia per correggere un giorno passato dimenticato.
 */
export function CycleCalendar({
  fertileWindow,
  nextPeriodRange,
  onSelectDay,
}: {
  fertileWindow: { startDate: string; endDate: string } | null;
  nextPeriodRange: { rangeStartDate: string; rangeEndDate: string } | null;
  onSelectDay: (isoDate: string) => void;
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));

  const from = toIso(startOfMonth(monthAnchor));
  const to = toIso(endOfMonth(monthAnchor));
  const { data } = useSWR(`/api/cycle/logs?from=${from}&to=${to}`, fetcher);
  const logs: CycleLog[] = data?.logs ?? [];

  const flowByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of logs) if (l.flow) map.set(l.log_date, l.flow);
    return map;
  }, [logs]);

  const todayIso = toIso(new Date());

  const cells = useMemo(() => {
    const first = startOfMonth(monthAnchor);
    const last = endOfMonth(monthAnchor);
    // Lunedì = 0: getDay() usa Domenica = 0, la convertiamo per allineare
    // la settimana italiana (Lun-Dom) come nelle etichette sopra.
    const leadingBlanks = (first.getDay() + 6) % 7;
    const days: (Date | null)[] = Array(leadingBlanks).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), d));
    return days;
  }, [monthAnchor]);

  const isInRange = (iso: string, start?: string, end?: string) => !!start && !!end && iso >= start && iso <= end;

  return (
    <div className="card-light space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="p-1.5 text-celeste-muted hover:text-celeste-navy"
          aria-label="Mese precedente"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium text-celeste-navy capitalize">
          {monthAnchor.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="p-1.5 text-celeste-muted hover:text-celeste-navy"
          aria-label="Mese successivo"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={i} className="text-[11px] text-celeste-muted font-medium">
            {w}
          </span>
        ))}

        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const iso = toIso(day);
          const hasFlow = flowByDate.has(iso);
          const inFertile = isInRange(iso, fertileWindow?.startDate, fertileWindow?.endDate);
          const inPredictedPeriod = isInRange(iso, nextPeriodRange?.rangeStartDate, nextPeriodRange?.rangeEndDate);
          const isToday = iso === todayIso;

          return (
            <button
              key={iso}
              onClick={() => onSelectDay(iso)}
              className={clsx(
                "aspect-square rounded-full text-xs flex items-center justify-center relative transition-colors",
                hasFlow && "bg-rose-500 text-white font-medium",
                !hasFlow && inFertile && "bg-amber-500/20 text-amber-700",
                !hasFlow && !inFertile && inPredictedPeriod && "border-2 border-dashed border-rose-400 text-rose-500",
                !hasFlow && !inFertile && !inPredictedPeriod && "text-celeste-navy hover:bg-celeste-navy/5",
                isToday && !hasFlow && "ring-2 ring-celeste-accent"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-celeste-muted pt-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Mestruazioni
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/40" /> Finestra fertile
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-rose-400" /> Ciclo previsto
        </span>
      </div>
    </div>
  );
}
