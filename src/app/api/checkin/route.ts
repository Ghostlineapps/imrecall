import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { reverseGeocode } from "@/lib/utils/geocoding";

/**
 * Chiamato all'apertura dell'app (non background tracking — vedi nota nel
 * piano tecnico sui limiti di iOS PWA). Se l'utente è vicino a un luogo
 * legato a una memoria, genera il candidato di resurfacing che il motore in
 * /api/insights/today potrà proporre. Due casi distinti, entrambe le
 * varianti del "cuore" del prodotto:
 * - nearby_intentions(): "volevo tornare qui" — un'intenzione ancora aperta.
 * - nearby_memories(): "eri già qui" — una foto/memoria passata collegata
 *   al luogo (via GPS dello scatto, vedi geocodeAndLinkPlaceByCoords in
 *   classification.ts). Questo è il caso "fotografo un ristorante in Cina,
 *   ci torno un anno dopo e l'app me lo ricorda".
 */
export async function POST(req: NextRequest) {
  // Bearer token oltre ai cookie: il geofencing nativo Android chiama
  // questo stesso endpoint da un servizio in background, senza WebView —
  // vedi getAuthenticatedUser in lib/supabase/server.ts.
  const { supabase, user } = await getAuthenticatedUser(req);
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

  const [{ data: intentions }, { data: memories }] = await Promise.all([
    supabase.rpc("nearby_intentions", {
      p_user_id: user.id,
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_km: 15,
    }),
    supabase.rpc("nearby_memories", {
      p_user_id: user.id,
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_km: 15,
    }),
  ]);

  const nearby = [...(intentions ?? []), ...(memories ?? [])];
  if (nearby.length === 0) {
    return NextResponse.json({ candidates_created: 0 });
  }

  // Evita duplicati: non ricreare un candidato per la stessa memoria se già
  // in coda e non ancora mostrato. I due RPC sono per costruzione mutuamente
  // esclusivi sulle intenzioni aperte, quindi non c'è rischio che la stessa
  // memoria compaia in entrambe le liste.
  const memoryIds = nearby.map((n: any) => n.memory_id);
  const { data: existing } = await supabase
    .from("resurface_candidates")
    .select("memory_id")
    .eq("user_id", user.id)
    .eq("type", "proximity")
    .eq("sent", false)
    .in("memory_id", memoryIds);

  const alreadyQueued = new Set((existing ?? []).map((e: any) => e.memory_id));

  const fromIntentions = (intentions ?? [])
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

  const fromMemories = (memories ?? [])
    .filter((n: any) => !alreadyQueued.has(n.memory_id))
    .map((n: any) => {
      const when = n.memory_date ? format(new Date(n.memory_date), "d MMMM yyyy", { locale: it }) : null;
      return {
        user_id: user.id,
        type: "proximity",
        memory_id: n.memory_id,
        place_id: n.place_id,
        // priorità di base più bassa delle intenzioni esplicite: qui
        // l'utente non aveva chiesto di tornarci, è un ricordo incidentale
        priority_score: 55 + Math.max(0, 15 - n.distance_km),
        title: `Sei tornato a ${n.place_name}`,
        body: when ? `Il ${when} eri qui: ${(n.content ?? "").slice(0, 120)}` : (n.content ?? "").slice(0, 140),
      };
    });

  const toInsert = [...fromIntentions, ...fromMemories];

  if (toInsert.length > 0) {
    await supabase.from("resurface_candidates").insert(toInsert);
  }

  // Titolo/testo dei candidati appena creati (i più rilevanti, max 3): il
  // ricevitore del geofence nativo li usa per mostrare subito una notifica
  // locale, senza bisogno di un canale push separato per l'arrivo sul posto.
  const candidates = toInsert
  .slice()
  .sort((a, b) => b.priority_score - a.priority_score)
  .slice(0, 3)
  .map(({ title, body }) => ({ title, body }));

  return NextResponse.json({ candidates_created: toInsert.length, candidates });
}
