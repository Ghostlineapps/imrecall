import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// L'estrazione EXIF avviene client-side (vedi settings/location/page.tsx):
// qui riceviamo solo i punti già estratti (lat/lng/orario), mai le foto.
const MAX_POINTS = 5000;
const INSERT_CHUNK_SIZE = 500;

type IncomingPoint = {
  latitude?: unknown;
  longitude?: unknown;
  recorded_at?: unknown;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const rawPoints: IncomingPoint[] = Array.isArray(body?.points) ? body.points.slice(0, MAX_POINTS) : [];

  const rows = rawPoints
    .filter(
      (p): p is { latitude: number; longitude: number; recorded_at: string } =>
        typeof p.latitude === "number" && typeof p.longitude === "number" && typeof p.recorded_at === "string"
    )
    .map((p) => ({
      user_id: user.id,
      latitude: p.latitude,
      longitude: p.longitude,
      source: "photo",
      recorded_at: p.recorded_at,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "no_points_found" }, { status: 400 });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const { error } = await supabase.from("location_checkins").insert(chunk);
    if (error) {
      return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    }
    inserted += chunk.length;
  }

  return NextResponse.json({ ok: true, inserted });
}
