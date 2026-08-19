import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nowInRome } from "@/lib/utils/romeTime";
import { medicationDueOn } from "@/lib/medications/recurrence";

// Elenco delle dosi di oggi (una per farmaco attivo e orario), con lo stato
// "presa/da prendere" — alimenta il widget "Farmaci di oggi" in Dashboard.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { date: today } = nowInRome();

  const { data: allMedications, error } = await supabase
    .from("medications")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Non tutti i farmaci attivi sono dovuti oggi — vedi migrazione 019
  // (ricorrenza settimanale/mensile/a intervalli, con range di date
  // opzionale). Un farmaco "non dovuto oggi" semplicemente non compare
  // nella lista, invece di apparire ogni giorno con la spunta da dare.
  const medications = (allMedications ?? []).filter((m: any) => medicationDueOn(m, today));

  const ids = medications.map((m: any) => m.id);

  const { data: logs } =
    ids.length > 0
      ? await supabase
          .from("medication_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("log_date", today)
          .in("medication_id", ids)
      : { data: [] as any[] };

  const logByKey = new Map<string, any>(
    (logs ?? []).map((l: any) => [`${l.medication_id}_${l.scheduled_time}`, l])
  );

  const schedule = (medications ?? [])
    .flatMap((m: any) =>
      (m.times as string[]).map((time) => {
        const log = logByKey.get(`${m.id}_${time}`);
        return {
          medication_id: m.id,
          memory_id: m.memory_id,
          name: m.name,
          dose: m.dose,
          time,
          taken: !!log?.taken_at,
          taken_at: log?.taken_at ?? null,
        };
      })
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  return NextResponse.json({ date: today, schedule });
}
