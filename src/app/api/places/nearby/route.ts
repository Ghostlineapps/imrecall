import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Consigli nei paraggi filtrati sul profilo (dieta + interessi). Usiamo
 * Overpass API (dati OpenStreetMap), coerente con la scelta già fatta per
 * geocoding.ts: gratuita, senza API key, sufficiente per un primo consiglio
 * "vicino a te" senza dover configurare Google Places su Vercel. La
 * contropartita è la copertura dei tag: diet:vegan=yes ecc. sono presenti
 * solo dove qualcuno li ha mappati, quindi i risultati variano molto da
 * città a città — è un compromesso accettabile per partire.
 */
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "IMRECALL-PersonalMemoryApp/1.0 (contatto: mitolo1@gmail.com)";
const DEFAULT_RADIUS_M = 2000;
const MAX_RESULTS = 12;

// Ogni voce produce una o più clausole Overpass QL (node["key"~"a|b"]).
// Il raggio e le coordinate vengono sostituiti in fetchOverpass().
const DIET_TAG_MAP: Record<string, string> = {
  vegan: 'node["diet:vegan"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
  vegetarian:
    'node["diet:vegetarian"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
  gluten_free: 'node["diet:gluten_free"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
  lactose_free: 'node["diet:lactose_free"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
  halal: 'node["diet:halal"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
  kosher: 'node["diet:kosher"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
  pescetarian:
    'node["diet:vegetarian"~"yes|only"]["amenity"~"^(restaurant|cafe|fast_food)$"](around:R,LAT,LON);',
};

const INTEREST_TAG_MAP: Record<string, string> = {
  food: 'node["amenity"~"^(restaurant|fast_food)$"](around:R,LAT,LON);',
  art: 'node["tourism"~"^(museum|gallery|artwork)$"](around:R,LAT,LON);',
  history: 'node["historic"](around:R,LAT,LON);',
  nature: 'node["leisure"="park"](around:R,LAT,LON);node["natural"~"^(beach|wood)$"](around:R,LAT,LON);',
  nightlife: 'node["amenity"~"^(bar|nightclub|pub)$"](around:R,LAT,LON);',
  shopping: 'node["shop"](around:R,LAT,LON);',
  cafes: 'node["amenity"="cafe"](around:R,LAT,LON);',
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildClauses(tagKeys: string[], map: Record<string, string>, lat: number, lon: number, radius: number) {
  const clauses: string[] = [];
  for (const key of tagKeys) {
    const template = map[key];
    if (!template) continue;
    clauses.push(
      template.replaceAll("R", String(radius)).replaceAll("LAT", String(lat)).replaceAll("LON", String(lon))
    );
  }
  return clauses;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
  }
  const radius = Math.min(Math.max(Number(searchParams.get("radius") ?? DEFAULT_RADIUS_M), 300), 5000);

  const { data: profile } = await supabase
    .from("profiles")
    .select("dietary_preferences, interests")
    .eq("id", user.id)
    .single();

  const diet: string[] = profile?.dietary_preferences ?? [];
  const interests: string[] = profile?.interests ?? [];

  // Profilo non ancora compilato: mostriamo comunque qualcosa di generico
  // (cibo + caffè) invece di una sezione vuota, con l'invito a compilarlo.
  const hasPreferences = diet.length > 0 || interests.length > 0;
  const dietClauses = buildClauses(diet, DIET_TAG_MAP, lat, lon, radius);
  const interestClauses = buildClauses(interests, INTEREST_TAG_MAP, lat, lon, radius);
  const clauses = hasPreferences
    ? [...dietClauses, ...interestClauses]
    : buildClauses(["food", "cafes"], INTEREST_TAG_MAP, lat, lon, radius);

  // Il taglio ai primi MAX_RESULTS avviene lato nostro dopo l'ordinamento
  // per distanza (sotto), non qui: la sintassi del limite su "out" varia a
  // seconda dei modificatori ed è più fragile da comporre a mano.
  const query = `[out:json][timeout:15];(${clauses.join("")});out center;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      return NextResponse.json({ recommendations: [], hasPreferences, error: "overpass_unavailable" });
    }

    const json = await res.json();
    const elements = (json?.elements ?? []) as any[];

    const seen = new Set<number>();
    const recommendations = elements
      .filter((el) => el?.tags?.name && !seen.has(el.id) && seen.add(el.id))
      .map((el) => {
        const category =
          el.tags.amenity || el.tags.tourism || el.tags.historic || el.tags.shop || el.tags.leisure || el.tags.natural || "luogo";
        return {
          id: el.id,
          name: el.tags.name as string,
          category,
          latitude: el.lat,
          longitude: el.lon,
          distance_km: Math.round(haversineKm(lat, lon, el.lat, el.lon) * 10) / 10,
        };
      })
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, MAX_RESULTS);

    return NextResponse.json({ recommendations, hasPreferences });
  } catch (err) {
    console.error("Overpass fallito", err);
    return NextResponse.json({ recommendations: [], hasPreferences, error: "overpass_unavailable" });
  }
}
