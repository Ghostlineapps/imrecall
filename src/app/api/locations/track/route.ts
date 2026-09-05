import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { reverseGeocodeBestName } from "@/lib/utils/geocoding";

// Insiemi ammessi per "source": oltre al vecchio "live" (tab browser in
// foreground), il servizio nativo Android distingue un fix rado durante lo
// spostamento da una sosta confermata — vedi LocationTrackingService lato
// nativo e il piano tecnico sul tracking adattivo.
const ALLOWED_SOURCES = new Set(["live", "live_sparse", "live_stop"]);

// Salva una singola posizione GPS inviata dal browser o dal servizio nativo
// Android durante il tracciamento.
export async function POST(req: NextRequest) {
  // Bearer token oltre ai cookie: il tracking nativo in background non ha
  // una WebView — vedi getAuthenticatedUser in lib/supabase/server.ts.
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { latitude, longitude, accuracy, recorded_at, source } = body;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
  }

  const resolvedSource = ALLOWED_SOURCES.has(source) ? source : "live";

  // Traduciamo subito in un nome di luogo leggibile, così "I tuoi ultimi
  // spostamenti" mostra "Via Roma 12, Milano" invece delle sole coordinate
  // — o, quando le coordinate corrispondono a un locale/monumento
  // riconoscibile, il suo nome vero (reverseGeocodeBestName, fix
  // 2026-09-06: vedi geocoding.ts). Il tracciamento live scrive al massimo
  // ogni 10 minuti, quindi una richiesta a Nominatim per punto resta ben
  // dentro il limite d'uso.
  const place_name = await reverseGeocodeBestName(latitude, longitude).catch(() => null);

  const { error } = await supabase.from("location_checkins").insert({
    user_id: user.id,
    latitude,
    longitude,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    place_name,
    source: resolvedSource,
    recorded_at: recorded_at ?? new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
