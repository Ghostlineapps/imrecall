import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TRACKING_MODES = new Set(["general_health", "trying_to_conceive", "avoiding_pregnancy"]);

/** Impostazioni del ciclo dell'utente, o null se non ha ancora fatto
 * l'onboarding (nessuna riga creata finché non salva la prima volta —
 * vedi PATCH sotto). */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: settings, error } = await supabase
    .from("cycle_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings });
}

/** Crea o aggiorna le impostazioni. average_cycle_length/
 * average_period_length sono modificabili SOLO durante l'onboarding
 * (cycles_tracked === 0, nessun ciclo ancora osservato dai log): appena ci
 * sono dati reali, le medie vengono sempre ricalcolate da
 * recalculateCyclePeriods e non più sovrascrivibili a mano, per non
 * disallineare previsioni mostrate e cronologia effettiva. */
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  const { data: existing } = await supabase
    .from("cycle_settings")
    .select("cycles_tracked")
    .eq("user_id", user.id)
    .maybeSingle();

  const updates: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (typeof body?.tracking_mode === "string" && TRACKING_MODES.has(body.tracking_mode)) {
    updates.tracking_mode = body.tracking_mode;
  }
  if (typeof body?.notifications_enabled === "boolean") {
    updates.notifications_enabled = body.notifications_enabled;
  }
  if (!existing || existing.cycles_tracked === 0) {
    if (Number.isFinite(body?.average_cycle_length)) {
      updates.average_cycle_length = Math.min(60, Math.max(15, Math.round(body.average_cycle_length)));
    }
    if (Number.isFinite(body?.average_period_length)) {
      updates.average_period_length = Math.min(14, Math.max(1, Math.round(body.average_period_length)));
    }
  }

  const { data: settings, error } = await supabase
    .from("cycle_settings")
    .upsert(updates, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings });
}
