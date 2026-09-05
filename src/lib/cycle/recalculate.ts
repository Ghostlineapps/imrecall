import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { computeAverageCycleLength } from "./predictions";

type SupabaseClient = ReturnType<typeof createClient>;

function isNextCalendarDay(previousIso: string, currentIso: string): boolean {
  const prev = new Date(previousIso + "T00:00:00");
  const curr = new Date(currentIso + "T00:00:00");
  return differenceInCalendarDays(curr, prev) === 1;
}

/**
 * Ricostruisce cycle_periods da zero a partire da tutti i cycle_logs con un
 * flusso registrato, e aggiorna le medie in cycle_settings di conseguenza.
 * Richiamata da /api/cycle/logs dopo ogni upsert.
 *
 * Ricalcolare tutto invece di aggiornare in modo incrementale è
 * volutamente la scelta più semplice: il volume di dati per utente resta
 * piccolo (anni di log restano poche centinaia di righe), e questo evita
 * tutta la casistica fragile di un aggiornamento incrementale — modifica di
 * un log passato, giorno dimenticato e aggiunto dopo, cancellazione di un
 * giorno che spezzava un periodo in due, ecc. — che altrimenti andrebbe
 * gestita esplicitamente caso per caso.
 */
export async function recalculateCyclePeriods(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: logs, error: logsError } = await supabase
    .from("cycle_logs")
    .select("log_date")
    .eq("user_id", userId)
    .not("flow", "is", null)
    .order("log_date", { ascending: true });

  if (logsError) throw logsError;

  const bleedingDays = (logs ?? []).map((l) => l.log_date as string);

  const groups: { start_date: string; end_date: string }[] = [];
  for (const day of bleedingDays) {
    const last = groups[groups.length - 1];
    if (last && isNextCalendarDay(last.end_date, day)) {
      last.end_date = day;
    } else {
      groups.push({ start_date: day, end_date: day });
    }
  }

  const periodRows = groups.map((g, i) => ({
    user_id: userId,
    start_date: g.start_date,
    end_date: g.end_date,
    cycle_length_days:
      i === 0
        ? null
        : differenceInCalendarDays(new Date(g.start_date + "T00:00:00"), new Date(groups[i - 1].start_date + "T00:00:00")),
  }));

  // Sostituzione completa: più semplice e sicura di un diff riga-per-riga
  // per un dataset di queste dimensioni (vedi nota sopra).
  const { error: deleteError } = await supabase.from("cycle_periods").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (periodRows.length > 0) {
    const { error: insertError } = await supabase.from("cycle_periods").insert(periodRows);
    if (insertError) throw insertError;
  }

  // Più recenti prima, come richiesto da computeAverageCycleLength.
  const mostRecentFirst = periodRows.slice().reverse();
  const cyclesTracked = periodRows.filter((p) => p.cycle_length_days !== null).length;

  // Il periodo più recente potrebbe essere ancora in corso (l'utente non ha
  // ancora smesso di sanguinare): lo escludiamo dal calcolo della durata
  // media delle mestruazioni, altrimenti un solo giorno già loggato di un
  // periodo che magari continuerà domani verrebbe registrato come "durata
  // definitiva: 1 giorno".
  const completedPeriodLengths = mostRecentFirst
    .slice(1, 7)
    .map((p) => differenceInCalendarDays(new Date(p.end_date + "T00:00:00"), new Date(p.start_date + "T00:00:00")) + 1);

  // Aggiorniamo le medie SOLO quando ci sono dati reali da cui calcolarle.
  // Altrimenti sovrascriveremmo la stima manuale inserita in onboarding (o
  // il default della tabella) con un numero dedotto da dati insufficienti
  // — es. il primissimo giorno mai loggato darebbe "ciclo medio: 28 giorni"
  // (fallback) e "mestruazioni: 1 giorno" (unico giorno finora), cancellando
  // silenziosamente quanto l'utente aveva dichiarato lui stesso.
  const settingsUpdate: Record<string, unknown> = {
    user_id: userId,
    cycles_tracked: cyclesTracked,
    updated_at: new Date().toISOString(),
  };
  if (cyclesTracked > 0) {
    settingsUpdate.average_cycle_length = computeAverageCycleLength(mostRecentFirst);
  }
  if (completedPeriodLengths.length > 0) {
    settingsUpdate.average_period_length = Math.round(
      completedPeriodLengths.reduce((a, b) => a + b, 0) / completedPeriodLengths.length
    );
  }

  const { error: settingsError } = await supabase
    .from("cycle_settings")
    .upsert(settingsUpdate, { onConflict: "user_id" });
  if (settingsError) throw settingsError;
}
