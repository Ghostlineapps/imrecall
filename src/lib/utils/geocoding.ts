/**
 * Geocodifica un nome di luogo in coordinate e viceversa. Usiamo Nominatim
 * (OpenStreetMap), che non richiede una API key — a differenza di Google/
 * Mapbox, funziona subito senza bisogno di configurare nulla su Vercel.
 * Nominatim chiede solo un header User-Agent che identifichi l'app e un
 * uso "leggero" (max ~1 richiesta al secondo), più che sufficiente per un
 * assistente personale.
 */
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "IMRECALL-PersonalMemoryApp/1.0 (contatto: mitolo1@gmail.com)";

export async function geocodePlace(
  placeName: string
): Promise<{ latitude: number; longitude: number; granularity: string } | null> {
  try {
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&q=${encodeURIComponent(placeName)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it" },
    });
    if (!res.ok) return null;

    const results = await res.json();
    const feature = results?.[0];
    if (!feature) return null;

    const granularity =
      feature.class === "amenity" || feature.class === "shop" || feature.class === "tourism"
        ? "poi"
        : feature.class === "building" || feature.type === "house"
          ? "address"
          : "city";

    return { latitude: parseFloat(feature.lat), longitude: parseFloat(feature.lon), granularity };
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
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=17&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.error) return null;

    // Costruiamo un nome leggibile e breve (es. "Via Roma 12, Milano")
    // invece del display_name completo di Nominatim, che è molto lungo
    // (include provincia, regione, CAP, nazione...).
    const addr = data.address ?? {};
    const street = [addr.road, addr.house_number].filter(Boolean).join(" ");
    const city = addr.city || addr.town || addr.village || addr.municipality;
    const short = [street, city].filter(Boolean).join(", ");

    return short || data.display_name || null;
  } catch (err) {
    console.error("Reverse geocoding fallito per", latitude, longitude, err);
    return null;
  }
}
