import type { createClient } from "@/lib/supabase/server";
import { findNearestPlace } from "./nearestPlace";
import { reverseGeocodeBestName } from "./geocoding";

type SupabaseClient = ReturnType<typeof createClient>;

// Entro questa distanza, un punto GPS "è" un luogo salvato dall'utente, non
// solo vicino ad esso — stessa soglia usata come raggio geofence di default
// per la granularità "poi" nel piano tecnico sul geofencing nativo.
const SAVED_PLACE_RADIUS_METERS = 150;

/**
 * Nome da mostrare per una posizione GPS: se cade entro
 * SAVED_PLACE_RADIUS_METERS da un luogo che l'utente ha salvato
 * esplicitamente (Impostazioni → Luoghi — es. "Casa", "Lavoro"), usa quel
 * nome invece del solo indirizzo da reverse geocoding.
 *
 * Prima, "Spostamenti" mostrava sempre l'indirizzo grezzo restituito da
 * Nominatim (es. "Strada Provinciale Bitonto - Mariotto - Mellitto,
 * Bitonto") anche quando quell'indirizzo ERA "Casa" per l'utente — un
 * indirizzo è solo testo per il reverse geocoding, senza alcun
 * collegamento ai luoghi salvati. Segnalato dall'utente il 2026-09-10,
 * insieme al problema più grande dei promemoria di prossimità che
 * ricomparivano in loop per lo stesso motivo (vedi migrazione 032).
 */
export async function resolvePlaceName(
  supabase: SupabaseClient,
  userId: string,
  latitude: number,
  longitude: number
): Promise<string | null> {
  const { data: places } = await supabase
    .from("places")
    .select("name, latitude, longitude")
    .eq("user_id", userId)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  const nearest = findNearestPlace(places ?? [], latitude, longitude, SAVED_PLACE_RADIUS_METERS);
  if (nearest) return nearest.name;

  return reverseGeocodeBestName(latitude, longitude).catch(() => null);
}
