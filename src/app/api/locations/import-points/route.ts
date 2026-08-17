import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Endpoint generico per importare punti di posizione già estratti lato
// client — sia dalle foto (EXIF, letto sul telefono) sia da un file di
// Google Takeout (parsato nel browser prima dell'invio). Riceviamo solo
// i punti già pronti {latitude, longitude, recorded_at}, mai un file
// grezzo: così anche export enormi di anni di cronologia restano ben
// sotto il limite di dimensione delle richieste del server.
const MAX_POINTS_PER_REQUEST = 2000;
const ALLOWED_SOURCES = new Set(["photo", "import"]);

type IncomingPoint = {
  latitude?: unknown;
  longitude?: unknown;
  recorded_at?: unknown;
  place_name?: unknown;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const source = ALLOWED_SOURCES.has(body?.source) ? body.source : "import";
  const rawPoints: IncomingPoint[] = Array.isArray(body?.points)
    ? body.points.slice(0, MAX_POINTS_PER_REQUEST)
    : [];

  const rows = rawPoints
    .filter(
      (p): p is { latitude: number; longitude: number; recorded_at: string; place_name?: string } =>
        typeof p.latitude === "number" && typeof p.longitude === "number" && typeof p.recorded_at === "string"
    )
    .map((p) => ({
      user_id: user.id,
      latitude: p.latitude,
      longitude: p.longitude,
      place_name: typeof p.place_name === "string" ? p.place_name : null,
      source,
      recorded_at: p.recorded_at,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "no_points_found" }, { status: 400 });
  }

  const { error } = await supabase.from("location_checkins").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: rows.length });
}
