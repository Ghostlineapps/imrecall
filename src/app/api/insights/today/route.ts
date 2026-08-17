import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Il cuore della strategia di retention: sceglie UN SOLO candidato di
 * resurfacing da mostrare oggi nella home, tra tutti i tipi disponibili
 * (on_this_day, proximity, deadline, pre_trip, people, manual_recall).
 *
 * Meno scelta per l'utente = più abitudine. Il candidato più urgente/
 * rilevante emerge da resurface_candidates, popolata dai vari job
 * (vedi /api/cron/*). Qui leggiamo solo il più prioritario non ancora
 * mostrato oggi.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_types_enabled")
    .eq("id", user.id)
    .single();

  const enabledTypes = profile?.notification_types_enabled ?? [
    "on_this_day", "proximity", "pre_trip", "people", "deadline", "manual_recall",
  ];

  const { data: candidate } = await supabase
    .from("resurface_candidates")
    .select("*")
    .eq("user_id", user.id)
    .eq("sent", false)
    .eq("dismissed", false)
    .in("type", enabledTypes)
    .order("priority_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!candidate) {
    return NextResponse.json({ candidate: null });
  }

  // Marca come mostrato (rispetta il limite "max 1 notifica/giorno" anche
  // per la visualizzazione in-app, non solo per le push)
  await supabase
    .from("resurface_candidates")
    .update({ sent: true, sent_at: new Date().toISOString() })
    .eq("id", candidate.id);

  return NextResponse.json({ candidate });
}
