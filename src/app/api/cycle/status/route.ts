import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeCycleStatus } from "@/lib/cycle/predictions";

/** Stato corrente del ciclo (giorno, fase, previsione prossimo ciclo e
 * finestra fertile) — usato sia dalla card in home sia dalla pagina
 * dedicata. onboarded=false finché l'utente non ha impostato la data
 * dell'ultima mestruazione la prima volta.
 *
 * visible=false quando l'utente ha esplicitamente detto di no alla
 * domanda posta in /onboarding (migration 033, profiles.tracks_cycle) —
 * in quel caso il chiamante non deve mostrare né la card in home né il
 * punto d'ingresso in Salute. null/true restano visibili: chi non ha
 * ancora risposto (utenti già esistenti prima della 033, o un raro caso
 * limite) continua a vedere l'invito come prima di questa modifica. */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("tracks_cycle")
    .eq("id", user.id)
    .maybeSingle();

  const visible = profile?.tracks_cycle !== false;

  if (!visible) {
    return NextResponse.json({ visible: false, status: null, settings: null, onboarded: false });
  }

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

  return NextResponse.json({ visible: true, status, settings: settings ?? null, onboarded: !!settings });
}
