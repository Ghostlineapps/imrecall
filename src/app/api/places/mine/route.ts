import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

// Numero massimo di luoghi restituiti: Android permette al massimo 100
// geofence registrati per app, quindi il client nativo ne registra al più
// questi (con margine per eventuali geofence di sistema).
const MAX_PLACES = 80;

/**
* Elenco dei luoghi salvati dell'utente, usato dal servizio nativo Android
* (GeofenceSyncWorker) per registrare i geofence di arrivo. Autenticato via
* bearer token (vedi getAuthenticatedUser) perché chiamato da un servizio in
* background, senza WebView.
*
* Restituisce solo i luoghi con coordinate note e granularità "address" o
* "poi": "city" è troppo estesa per un geofence affidabile (vedi piano
* tecnico sul geofencing).
*/
export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const { data: places, error } = await supabase
  .from("places")
  .select("id, name, latitude, longitude, granularity")
  .eq("user_id", user.id)
  .not("latitude", "is", null)
  .not("longitude", "is", null)
  .in("granularity", ["address", "poi"])
  // Euristica di rilevanza semplice: i luoghi geocodificati/menzionati più
// di recente hanno più probabilità di essere ancora significativi per
// l'utente. Volendo si può raffinare ordinando per numero di memorie
// collegate (tabella memory_places), non necessario per ora.
.order("created_at", { ascending: false })
  .limit(MAX_PLACES);

if (error) return NextResponse.json({ error: error.message }, { status: 500 });

return NextResponse.json({ places: places ?? [] });
}
