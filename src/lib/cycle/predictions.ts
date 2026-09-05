import { addDays, differenceInCalendarDays } from "date-fns";

/**
 * Logica di previsione del ciclo — funzioni pure, nessuna chiamata al
 * database qui dentro: le route in src/app/api/cycle/* leggono le righe da
 * Supabase e passano solo i dati già estratti, così questa logica resta
 * testabile e riusabile (es. dalla stessa card home e dalla pagina
 * dedicata) senza duplicare le query.
 *
 * La fase luteale (dall'ovulazione all'inizio del ciclo successivo) è
 * biologicamente molto più costante (~14 giorni) della fase follicolare,
 * che varia parecchio da persona a persona e da ciclo a ciclo — per questo
 * stimiamo l'ovulazione contando all'indietro dalla PROSSIMA mestruazione
 * prevista, non in avanti dall'ultima: è il metodo standard usato anche da
 * Clue, più affidabile del semplice "giorno 14".
 */

export type CyclePhase = "mestruazione" | "follicolare" | "ovulazione" | "luteale";

export type Confidence = "bassa" | "media" | "alta";

export interface CyclePeriodSummary {
  start_date: string; // YYYY-MM-DD
  cycle_length_days: number | null;
}

export interface CycleStatus {
  cycleDay: number | null;
  phase: CyclePhase | null;
  nextPeriod: {
    date: string;
    rangeStartDate: string;
    rangeEndDate: string;
    confidence: Confidence;
  } | null;
  fertileWindow: {
    startDate: string;
    endDate: string;
    ovulationDate: string;
  } | null;
}

const LUTEAL_PHASE_DAYS = 14;
// Finestra fertile: la sopravvivenza degli spermatozoi (fino a 5 giorni) più
// un giorno dopo l'ovulazione per la vitalità residua dell'ovulo — la
// stessa finestra usata dalle principali app di fertilità.
const FERTILE_WINDOW_BEFORE_OVULATION = 5;
const FERTILE_WINDOW_AFTER_OVULATION = 1;

// Sotto questa soglia di cicli osservati, la previsione è poco più che una
// stima statistica generica: meglio dichiararlo apertamente (range ampio,
// confidenza bassa) che mostrare una data secca che poi si rivela sbagliata
// e brucia la fiducia nell'app — il problema più lamentato con le app di
// tracciamento ciclo esistenti.
function confidenceFor(cyclesTracked: number): { level: Confidence; rangeDays: number } {
  if (cyclesTracked >= 5) return { level: "alta", rangeDays: 2 };
  if (cyclesTracked >= 2) return { level: "media", rangeDays: 3 };
  return { level: "bassa", rangeDays: 5 };
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Media mobile della lunghezza del ciclo sugli ultimi cicli completi
 * (quelli con cycle_length_days valorizzato — il primo periodo mai
 * registrato non ne ha uno, non essendoci un periodo precedente da cui
 * misurare). Usiamo al più le ultime 6 osservazioni: un ciclo di 3 anni fa
 * conta meno di uno recente per prevedere il prossimo.
 */
export function computeAverageCycleLength(periods: CyclePeriodSummary[], fallback = 28): number {
  const completed = periods
    .map((p) => p.cycle_length_days)
    .filter((n): n is number => typeof n === "number" && n > 0)
    .slice(0, 6);

  if (completed.length === 0) return fallback;
  const sum = completed.reduce((a, b) => a + b, 0);
  return Math.round(sum / completed.length);
}

/**
 * Stato completo del ciclo a partire dall'ultimo periodo noto. Ritorna
 * tutto null se non c'è ancora nessun log (utente non ancora onboardato).
 */
export function computeCycleStatus(
  lastPeriodStartIso: string | null,
  averageCycleLength: number,
  averagePeriodLength: number,
  cyclesTracked: number,
  today: Date = new Date()
): CycleStatus {
  if (!lastPeriodStartIso) {
    return { cycleDay: null, phase: null, nextPeriod: null, fertileWindow: null };
  }

  const lastStart = new Date(lastPeriodStartIso + "T00:00:00");
  const cycleDay = differenceInCalendarDays(today, lastStart) + 1;

  const nextPeriodDate = addDays(lastStart, averageCycleLength);
  const { level, rangeDays } = confidenceFor(cyclesTracked);

  const ovulationDate = addDays(nextPeriodDate, -LUTEAL_PHASE_DAYS);
  const fertileStart = addDays(ovulationDate, -FERTILE_WINDOW_BEFORE_OVULATION);
  const fertileEnd = addDays(ovulationDate, FERTILE_WINDOW_AFTER_OVULATION);

  const ovulationDayOfCycle = averageCycleLength - LUTEAL_PHASE_DAYS;
  const fertileStartDay = ovulationDayOfCycle - FERTILE_WINDOW_BEFORE_OVULATION;
  const fertileEndDay = ovulationDayOfCycle + FERTILE_WINDOW_AFTER_OVULATION;

  let phase: CyclePhase;
  if (cycleDay <= averagePeriodLength) {
    phase = "mestruazione";
  } else if (cycleDay >= fertileStartDay && cycleDay <= fertileEndDay) {
    phase = "ovulazione";
  } else if (cycleDay < fertileStartDay) {
    phase = "follicolare";
  } else {
    phase = "luteale";
  }

  return {
    cycleDay,
    phase,
    nextPeriod: {
      date: toIso(nextPeriodDate),
      rangeStartDate: toIso(addDays(nextPeriodDate, -rangeDays)),
      rangeEndDate: toIso(addDays(nextPeriodDate, rangeDays)),
      confidence: level,
    },
    fertileWindow: {
      startDate: toIso(fertileStart),
      endDate: toIso(fertileEnd),
      ovulationDate: toIso(ovulationDate),
    },
  };
}

/**
 * Intervallo di "giorno del ciclo" [da, a] (1-indicizzato) coperto da una
 * fase, date le medie correnti. Usata sia da computeCycleStatus sopra sia
 * da /api/cycle/insights per proiettare la stessa fase sui cicli passati
 * (serve a rispondere a "cosa ho scritto di solito in questa fase?").
 */
export function phaseDayRange(
  phase: CyclePhase,
  averageCycleLength: number,
  averagePeriodLength: number
): [number, number] {
  const ovulationDayOfCycle = averageCycleLength - LUTEAL_PHASE_DAYS;
  const fertileStartDay = ovulationDayOfCycle - FERTILE_WINDOW_BEFORE_OVULATION;
  const fertileEndDay = ovulationDayOfCycle + FERTILE_WINDOW_AFTER_OVULATION;

  switch (phase) {
    case "mestruazione":
      return [1, averagePeriodLength];
    case "follicolare":
      return [averagePeriodLength + 1, Math.max(fertileStartDay - 1, averagePeriodLength + 1)];
    case "ovulazione":
      return [fertileStartDay, fertileEndDay];
    case "luteale":
      return [fertileEndDay + 1, Math.max(averageCycleLength, fertileEndDay + 1)];
  }
}

export const SYMPTOM_OPTIONS = [
  "crampi",
  "mal_di_testa",
  "gonfiore",
  "acne",
  "tensione_seno",
  "nausea",
  "stanchezza",
  "mal_di_schiena",
  "insonnia",
] as const;

export const MOOD_OPTIONS = ["felice", "energica", "irritabile", "triste", "ansiosa", "stanca"] as const;

export const FLOW_OPTIONS = ["spotting", "light", "medium", "heavy"] as const;

export const PHASE_LABELS: Record<CyclePhase, string> = {
  mestruazione: "Mestruazioni",
  follicolare: "Fase follicolare",
  ovulazione: "Ovulazione probabile",
  luteale: "Fase luteale",
};
