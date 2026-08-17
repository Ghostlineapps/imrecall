import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocode } from "@/lib/utils/geocoding";

// Quanti punti senza nome del luogo "ripariamo" ad ogni caricamento della
// lista. Punti nuovi (live/checkin) hanno già place_name dal momento
// dell'inserimento; questo copre solo i punti vecchi, creati prima di
// quella modifica, o import senza nome. Teniamo il numero basso per
// restare ben dentro al limite d'uso di Nominatim (~1 richiesta/sec).
const BACKFILL_BATCH = 5;

// Elenco degli ultimi spostamenti registrati (import da Google Maps +
// tracciamento live + check-in di prossimità), più recenti prima.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const { data: locations, error } = await supabase
    .from("location_checkins")
    .select("*")
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const missing = (locations ?? []).filter((loc) => !loc.place_name).slice(0, BACKFILL_BATCH);
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (loc) => {
        const name = await reverseGeocode(loc.latitude, loc.longitude).catch(() => null);
        if (name) {
          loc.place_name = name;
          await supabase.from("location_checkins").update({ place_name: name }).eq("id", loc.id);
        }
      })
    );
  }

  return NextResponse.json({ locations });
}
