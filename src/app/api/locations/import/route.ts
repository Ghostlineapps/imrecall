import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Numero massimo di punti importabili in un'unica richiesta, per evitare
// export enormi (anni di cronologia Google) che sovraccaricano il DB.
const MAX_POINTS = 20000;
const INSERT_CHUNK_SIZE = 500;

type ParsedPoint = {
  latitude: number;
  longitude: number;
  timestamp: string;
  placeName?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const points = extractPoints(json).slice(0, MAX_POINTS);

  if (points.length === 0) {
    return NextResponse.json({ error: "no_points_found" }, { status: 400 });
  }

  const rows = points.map((p) => ({
    user_id: user.id,
    latitude: p.latitude,
    longitude: p.longitude,
    place_name: p.placeName ?? null,
    source: "import",
    recorded_at: p.timestamp,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const { error } = await supabase.from("location_checkins").insert(chunk);
    if (error) {
      return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    }
    inserted += chunk.length;
  }

  return NextResponse.json({ ok: true, inserted, total_found: points.length });
}

// Google esporta la cronologia spostamenti in formati diversi a seconda della
// fonte (Takeout classico "Records.json" oppure export dal telefono con
// "semanticSegments"). Proviamo a riconoscere entrambi.
function extractPoints(json: unknown): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  if (!json || typeof json !== "object") return points;
  const data = json as Record<string, unknown>;

  // Formato classico Google Takeout: { "locations": [{ latitudeE7, longitudeE7, timestamp }] }
  if (Array.isArray(data.locations)) {
    for (const raw of data.locations) {
      const loc = raw as Record<string, unknown>;
      let lat: number | null = null;
      let lng: number | null = null;

      if (typeof loc.latitudeE7 === "number" && typeof loc.longitudeE7 === "number") {
        lat = loc.latitudeE7 / 1e7;
        lng = loc.longitudeE7 / 1e7;
      } else if (typeof loc.latLng === "string") {
        const parsed = parseLatLng(loc.latLng);
        if (parsed) {
          lat = parsed.lat;
          lng = parsed.lng;
        }
      }

      const timestamp =
        typeof loc.timestamp === "string"
          ? loc.timestamp
          : typeof loc.timestampMs === "string"
            ? new Date(Number(loc.timestampMs)).toISOString()
            : null;

      if (lat != null && lng != null && timestamp) {
        points.push({ latitude: lat, longitude: lng, timestamp });
      }
    }
  }

  // Formato "Timeline" più recente esportato dal telefono: { "semanticSegments": [...] }
  if (Array.isArray(data.semanticSegments)) {
    for (const raw of data.semanticSegments) {
      const segment = raw as Record<string, unknown>;
      const visit = segment.visit as Record<string, unknown> | undefined;
      const topCandidate = visit?.topCandidate as Record<string, unknown> | undefined;
      const placeLocation = topCandidate?.placeLocation as Record<string, unknown> | undefined;
      const latLngValue = placeLocation?.latLng;

      if (typeof latLngValue === "string" && typeof segment.startTime === "string") {
        const parsed = parseLatLng(latLngValue);
        if (parsed) {
          points.push({
            latitude: parsed.lat,
            longitude: parsed.lng,
            timestamp: segment.startTime,
            placeName: typeof topCandidate?.semanticType === "string" ? topCandidate.semanticType : undefined,
          });
        }
      }
    }
  }

  return points;
}

function parseLatLng(value: string): { lat: number; lng: number } | null {
  // Formato tipico: "45.1234567°, 9.1234567°"
  const match = value.match(/(-?\d+(?:\.\d+)?)°?,\s*(-?\d+(?:\.\d+)?)°?/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}
