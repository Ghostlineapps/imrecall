/**
 * Geocodifica un nome di luogo in coordinate. Usa un provider esterno
 * (es. Google Geocoding API o Mapbox — configurabile via GEOCODING_API_KEY).
 * Qui implementato contro l'API Mapbox per semplicità; sostituibile.
 */
export async function geocodePlace(
  placeName: string
): Promise<{ latitude: number; longitude: number; granularity: string } | null> {
  const apiKey = process.env.GEOCODING_API_KEY;
  if (!apiKey) {
    console.warn("GEOCODING_API_KEY non configurata: geocoding saltato per", placeName);
    return null;
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      placeName
    )}.json?access_token=${apiKey}&limit=1`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const [longitude, latitude] = feature.center;
    const granularity = feature.place_type?.includes("poi")
      ? "poi"
      : feature.place_type?.includes("address")
      ? "address"
      : "city";

    return { latitude, longitude, granularity };
  } catch (err) {
    console.error("Geocoding fallito per", placeName, err);
    return null;
  }
}

/**
 * Reverse geocoding: da coordinate a un nome di luogo leggibile. Usato dalla
 * ricerca "dove mi trovavo il [data] alle [ora]?" per tradurre lat/lng in
 * un indirizzo comprensibile invece di mostrare solo numeri.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string | null> {
  const apiKey = process.env.GEOCODING_API_KEY;
  if (!apiKey) {
    console.warn("GEOCODING_API_KEY non configurata: reverse geocoding saltato");
    return null;
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${apiKey}&limit=1`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    return feature?.place_name ?? null;
  } catch (err) {
    console.error("Reverse geocoding fallito per", latitude, longitude, err);
    return null;
  }
}
