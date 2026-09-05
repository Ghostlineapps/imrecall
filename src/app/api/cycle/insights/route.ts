import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { computeCycleStatus, phaseDayRange, PHASE_LABELS } from "@/lib/cycle/predictions";

const MAX_PAST_PERIODS = 6;
const MIN_PERIODS_FOR_INSIGHT = 2;
// Un tag deve ricorrere almeno 2 volte nella stessa fase su cicli diversi
// per contare come pattern — un tag comparso una sola volta è solo un
// ricordo qualsiasi, non un'osservazione su come questa fase ti riguarda.
const MIN_TAG_OCCURRENCES = 2;

/**
 * Il punto che nessuna app di solo tracciamento ciclo (Flo, Clue...) può
 * offrire: correla la fase corrente del ciclo con i TUOI ricordi già
 * salvati nella stessa fase nei cicli precedenti — non serve loggare
 * sintomi apposta, usa quello che hai già scritto/fotografato. Es. "nei
 * giorni prima delle mestruazioni scrivi spesso ricordi taggati
 * #stanchezza" — un pattern reale sulla tua vita, non un consiglio
 * generico sul ciclo che troveresti identico su qualunque altra app.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: settings } = await supabase
    .from("cycle_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: periods } = await supabase
    .from("cycle_periods")
    .select("start_date")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })
    .limit(MAX_PAST_PERIODS + 1);

  if (!settings || !periods || periods.length === 0) {
    return NextResponse.json({ insight: null, reason: "not_onboarded" });
  }

  const avgCycleLength = settings.average_cycle_length;
  const avgPeriodLength = settings.average_period_length;

  const status = computeCycleStatus(periods[0].start_date, avgCycleLength, avgPeriodLength, settings.cycles_tracked);
  if (!status.phase) return NextResponse.json({ insight: null, reason: "not_onboarded" });

  // Il ciclo in corso (il più recente) resta escluso: vogliamo solo cicli
  // passati e già conclusi, per confrontare "questa volta" con "le altre
  // volte", non con se stesso.
  const pastPeriods = periods.slice(1);
  if (pastPeriods.length < MIN_PERIODS_FOR_INSIGHT) {
    return NextResponse.json({ insight: null, reason: "not_enough_cycles", phase: status.phase });
  }

  const [dayFrom, dayTo] = phaseDayRange(status.phase, avgCycleLength, avgPeriodLength);

  const ranges = pastPeriods.map((p) => {
    const start = new Date(p.start_date + "T00:00:00");
    return {
      from: addDays(start, dayFrom - 1).toISOString().slice(0, 10),
      to: addDays(start, dayTo - 1).toISOString().slice(0, 10),
    };
  });

  const tagCounts = new Map<string, number>();
  const examples: { id: string; ai_summary: string | null; title: string | null; memory_date: string }[] = [];

  for (const range of ranges) {
    const { data: memories } = await supabase
      .from("memories")
      .select("id, tags, ai_summary, title, memory_date")
      .eq("user_id", user.id)
      .gte("memory_date", `${range.from}T00:00:00`)
      .lte("memory_date", `${range.to}T23:59:59`)
      .limit(20);

    for (const m of memories ?? []) {
      for (const tag of m.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      if (examples.length < 3) {
        examples.push({ id: m.id, ai_summary: m.ai_summary, title: m.title, memory_date: m.memory_date });
      }
    }
  }

  const topTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= MIN_TAG_OCCURRENCES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  if (topTags.length === 0) {
    return NextResponse.json({ insight: null, reason: "no_pattern_found", phase: status.phase });
  }

  return NextResponse.json({
    insight: {
      phase: status.phase,
      phaseLabel: PHASE_LABELS[status.phase],
      tags: topTags,
      examples: examples.slice(0, 2),
      cyclesConsidered: pastPeriods.length,
    },
  });
}
