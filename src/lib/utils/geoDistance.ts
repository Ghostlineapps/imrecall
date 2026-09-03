// Formula dell'emisenoverso (haversine) per la distanza in metri tra due
// coordinate GPS — stessa formula già usata lato SQL per calcolare
// distance_km in nearby_intentions/nearby_memories (030_fix_nearby_
// functions.sql), qui in metri e in JS: serve a decidere lato client
// quando un nuovo fix di watchPosition è "abbastanza diverso" dall'ultimo
// per giustificare un refresh (vedi NearbyForYou.tsx e
// useLocationCheckin.ts).
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // raggio terrestre medio, in metri
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
