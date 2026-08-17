import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocode } from "@/lib/utils/geocoding";

// Salva una singola posizione GPS inviata dal browser durante il tracciamento live.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { latitude, longitude, accuracy, recorded_at } = body;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
  }

  // Traduciamo subito in un nome di luogo leggibile, così "I tuoi ultimi
  // spostamenti" mostra "Via Roma 12, Milano" invece delle sole coordinate.
  // Il tracciamento live scrive al massimo ogni 10 minuti, quindi una
  // richiesta a Nominatim per punto resta ben dentro il limite d'uso.
  const place_name = await reverseGeocode(latitude, longitude).catch(() => null);

  const { error } = await supabase.from("location_checkins").insert({
    user_id: user.id,
    latitude,
    longitude,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    place_name,
    source: "live",
    recorded_at: recorded_at ?? new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
