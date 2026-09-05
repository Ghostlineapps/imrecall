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
    // (include provincia, regione, CAP, nazione...). In zone dove Nominatim
    // non ha una via/città precisa (parchi, aree rurali, punti isolati) non
    // vogliamo mostrare "niente" o le sole coordinate: la stessa risposta
    // include comunque quasi sempre la gerarchia amministrativa completa
    // (regione, nazione), quindi scaliamo di livello invece di arrenderci.
    const addr = data.address ?? {};
    const street = [addr.road, addr.house_number].filter(Boolean).join(" ");
    const city = addr.city || addr.town || addr.village || addr.municipality;
    const region = addr.state || addr.county;
    const country = addr.country;

    const short = [street, city].filter(Boolean).join(", ");

    return short || city || region || country || data.display_name || null;
  } catch (err) {
    console.error("Reverse geocoding fallito per", latitude, longitude, err);
    return null;
  }
}

/**
 * Nome del punto d'interesse (monumento, ristorante, negozio...) alle
 * coordinate date, se Nominatim ne riconosce uno — a differenza di
 * reverseGeocode() sopra, che restituisce sempre un indirizzo generico
 * ("Via Roma 12, Milano") e non è pensato per riconoscere un luogo
 * specifico. Usata per arricchire la didascalia AI delle foto: senza
 * questo, la descrizione di una foto scattata alla Reggia di Caserta
 * diceva solo "un maestoso edificio storico" — GPT-4 Vision vede i pixel,
 * non sa dove si trova lo scatto, e le coordinate GPS della foto non
 * venivano mai passate al prompt (segnalato 2026-09-05).
 *
 * zoom=18 (contro il 17 di reverseGeocode) per restare a livello di
 * singolo edificio/esercizio invece che di isolato. Filtriamo per classe:
 * "building" e "highway" quasi sempre restituiscono un nome inutile (un
 * numero civico, il nome della via) anche quando presente, quindi non
 * contano come luogo riconosciuto — meglio nessun nome che uno fuorviante.
 */
const POI_CLASSES = new Set(["tourism", "amenity", "shop", "leisure", "historic", "office", "natural"]);

export async function reverseGeocodePlaceName(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.error || !data?.name) return null;

    return POI_CLASSES.has(data.class) ? data.name : null;
  } catch (err) {
    console.error("Reverse geocoding (nome luogo) fallito per", latitude, longitude, err);
    return null;
  }
}
