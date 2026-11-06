import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/noStore";

// Dati specifici dell'utente autenticato — non deve mai essere cacheabile
// da un CDN o dal browser (vedi noStoreJson).
export const dynamic = "force-dynamic";

// 2026-11-05: un candidato "proximity" (vedi /api/checkin/route.ts) viene
// creato quando l'utente è DAVVERO vicino a quel luogo in quel momento, ma
// non ha mai avuto una scadenza: se non veniva mostrato subito (priorità
// più bassa di un altro candidato quel giorno, o l'utente non riapriva
// l'app), restava in coda indefinitamente e poteva riemergere giorni dopo,
// quando l'utente si trovava altrove — segnalato dall'utente: una carta
// d'imbarco agganciata a "Bari" (check-in del 3 novembre, mentre era
// davvero in zona) mostrata più tardi mentre era a Caserta, a 200+ km di
// distanza, con il titolo fuorviante "Sei tornato a Bari". Gli altri tipi
// (on_this_day, deadline, pre_trip, people, manual_recall) non hanno
// questo problema: non affermano "sei qui ORA", quindi restano validi più
// a lungo.
const PROXIMITY_FRESHNESS_MS = 3 * 60 * 60 * 1000; // 3 ore dal check-in che l'ha creato

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

  // Scarta (dismissed, non delete: restano per analisi/debug) i candidati
  // "proximity" ormai troppo vecchi prima ancora di scegliere cosa
  // mostrare — altrimenti uno di questi potrebbe comunque vincere per
  // priority_score anche se ormai privo di senso rispetto alla posizione
  // attuale dell'utente, che qui non abbiamo modo di ricontrollare (questo
  // endpoint non riceve coordinate, vedi /api/checkin per dove vengono
  // generati).
  await supabase
    .from("resurface_candidates")
    .update({ dismissed: true })
    .eq("user_id", user.id)
    .eq("type", "proximity")
    .eq("sent", false)
    .eq("dismissed", false)
    .lt("created_at", new Date(Date.now() - PROXIMITY_FRESHNESS_MS).toISOString());

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
    return noStoreJson({ candidate: null });
  }

  // Marca come mostrato (rispetta il limite "max 1 notifica/giorno" anche
  // per la visualizzazione in-app, non solo per le push)
  await supabase
    .from("resurface_candidates")
    .update({ sent: true, sent_at: new Date().toISOString() })
    .eq("id", candidate.id);

  return noStoreJson({ candidate });
}
