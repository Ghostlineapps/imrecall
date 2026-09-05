import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocodeBestName } from "@/lib/utils/geocoding";

// Usato dal wizard di onboarding (/onboarding) subito dopo un import di
// spostamenti (Google Maps o foto): peschiamo fino a 3 punti "sparsi" nel
// tempo — il più vecchio, uno a metà e uno più recente — così il primo
// "wow" dell'utente è vedere IMRECALL rispondere con un ricordo vero e
// concreto ("il 12 marzo 2019 eri a Roma") invece di una schermata vuota.
// Non è pensata per uso ripetuto/paginato: è un momento, non una lista.
const MAX_HIGHLIGHTS = 3;

type Row = {
  id: string;
  latitude: number;
  longitude: number;
  place_name: string | null;
  recorded_at: string;
};

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { count } = await supabase
    .from("location_checkins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const total = count ?? 0;
  if (total === 0) {
    return NextResponse.json({ highlights: [] });
  }

  // Indici scelti per coprire l'intervallo temporale invece di prendere solo
  // i punti più recenti: il più vecchio disponibile, poi due punti sparsi
  // più avanti, con un po' di variazione casuale per non mostrare sempre
  // esattamente lo stesso terzetto a chi rifà l'onboarding due volte.
  const targetFractions = [0, 0.4 + Math.random() * 0.15, 0.75 + Math.random() * 0.2];
  const indices = Array.from(
    new Set(targetFractions.map((f) => Math.min(total - 1, Math.max(0, Math.floor(total * f)))))
  ).slice(0, MAX_HIGHLIGHTS);

  const rows: Row[] = [];
  for (const idx of indices) {
    const { data } = await supabase
      .from("location_checkins")
      .select("id, latitude, longitude, place_name, recorded_at")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: true })
      .range(idx, idx);
    if (data?.[0]) rows.push(data[0] as Row);
  }

  // Reverse geocoding solo per i punti senza nome già salvato (es. dagli
  // import, che spesso non lo hanno) — sequenziale, sono al massimo 3
  // chiamate, e Nominatim chiede comunque un uso "leggero".
  const highlights = [];
  for (const row of rows) {
    const placeName = row.place_name || (await reverseGeocodeBestName(row.latitude, row.longitude));
    highlights.push({
      recorded_at: row.recorded_at,
      place_name: placeName,
      latitude: row.latitude,
      longitude: row.longitude,
    });
  }

  return NextResponse.json({ highlights, total });
}
