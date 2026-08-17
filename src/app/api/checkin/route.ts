import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocode } from "@/lib/utils/geocoding";

/**
 * Chiamato all'apertura dell'app (non background tracking — vedi nota nel
 * piano tecnico sui limiti di iOS PWA). Se l'utente è vicino a un luogo
 * legato a un'intenzione aperta, genera il candidato di resurfacing che
 * il motore in /api/insights/today potrà proporre: il caso d'uso originale
 * "sei di nuovo a Siviglia, volevi andare in quel ristorante".
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { latitude, longitude } = await req.json();
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
  }

  // Anche qui traduciamo subito in un nome di luogo leggibile (vedi
  // /api/locations/track): questo endpoint scatta solo all'apertura
  // dell'app, quindi il volume di richieste resta basso.
  const place_name = await reverseGeocode(latitude, longitude).catch(() => null);
  await supabase.from("location_checkins").insert({ user_id: user.id, latitude, longitude, place_name });

  const { data: nearby } = await supabase.rpc("nearby_intentions", {
    p_user_id: user.id,
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_km: 15,
  });

  if (!nearby || nearby.length === 0) {
    return NextResponse.json({ candidates_created: 0 });
  }

  // Evita duplicati: non ricreare un candidato per la stessa memoria se già
  // in coda e non ancora mostrato
  const memoryIds = nearby.map((n: any) => n.memory_id);
  const { data: existing } = await supabase
    .from("resurface_candidates")
    .select("memory_id")
    .eq("user_id", user.id)
    .eq("type", "proximity")
    .eq("sent", false)
    .in("memory_id", memoryIds);

  const alreadyQueued = new Set((existing ?? []).map((e: any) => e.memory_id));
  const toInsert = nearby
    .filter((n: any) => !alreadyQueued.has(n.memory_id))
    .map((n: any) => ({
      user_id: user.id,
      type: "proximity",
      memory_id: n.memory_id,
      place_id: n.place_id,
      // più sei vicino, più alta la priorità
      priority_score: 70 + Math.max(0, 15 - n.distance_km),
      title: `Sei di nuovo a ${n.place_name}`,
      body: (n.content ?? "").slice(0, 140),
    }));

  if (toInsert.length > 0) {
    await supabase.from("resurface_candidates").insert(toInsert);
  }

  return NextResponse.json({ candidates_created: toInsert.length });
}
