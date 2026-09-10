import { haversineMeters } from "./geoDistance";

export interface HasCoords {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Tra una lista di luoghi (tipicamente i "Luoghi" salvati dall'utente),
 * trova quello più vicino a una posizione, entro una distanza massima in
 * metri. Ritorna null se nessuno rientra nella soglia.
 *
 * Estratto come funzione a sé (invece di ripeterlo in ogni route che ne ha
 * bisogno — track, checkin) perché serve in più punti con la stessa identica
 * logica: vedi resolvePlaceName.ts per il caso "che nome mostro per questa
 * posizione" e checkin/route.ts per "sono arrivato a un luogo con un
 * promemoria in sospeso".
 */
export function findNearestPlace<T extends HasCoords>(
  places: T[],
  latitude: number,
  longitude: number,
  maxDistanceMeters: number
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;

  for (const place of places) {
    if (place.latitude == null || place.longitude == null) continue;
    const distance = haversineMeters(latitude, longitude, place.latitude, place.longitude);
    if (distance <= maxDistanceMeters && distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }

  return best;
}
