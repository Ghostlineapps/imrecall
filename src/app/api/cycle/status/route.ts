import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeCycleStatus } from "@/lib/cycle/predictions";

/** Stato corrente del ciclo (giorno, fase, previsione prossimo ciclo e
 * finestra fertile) — usato sia dalla card in home sia dalla pagina
 * dedicata. onboarded=false finché l'utente non ha impostato la data
 * dell'ultima mestruazione la prima volta. */
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

  const { data: lastPeriod } = await supabase
    .from("cycle_periods")
    .select("start_date")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = computeCycleStatus(
    lastPeriod?.start_date ?? null,
    settings?.average_cycle_length ?? 28,
    settings?.average_period_length ?? 5,
    settings?.cycles_tracked ?? 0
  );

  return NextResponse.json({ status, settings: settings ?? null, onboarded: !!settings });
}
