// src/lib/import/locationImport.ts
//
// Logica condivisa per importare spostamenti passati da Google Takeout/
// Timeline (JSON) o dai dati GPS nelle foto (EXIF). In origine viveva solo
// dentro settings/location/page.tsx; 2026-09-02: estratta qui perché ora
// serve anche alla pagina di onboarding (/onboarding), che usa lo stesso
// import come primo "momento wow" per i nuovi utenti — vedi quella pagina
// per il contesto. Comportamento invariato, solo spostato.

export type PendingImportSource = "import" | "photo";

export type Point = { latitude: number; longitude: number; recorded_at: string; place_name?: string };

export const MAX_TAKEOUT_POINTS = 60000;
export const IMPORT_CHUNK_SIZE = 2000;

// Google esporta la cronologia spostamenti in diversi formati:
// 1) Takeout classico "Records.json": { locations: [ { latitudeE7, longitudeE7, timestamp } ] }
// 2) Takeout "Semantic Location History" (dismesso da Google): oggetto con
//    { timelineObjects: [ { placeVisit: {...} } | { activitySegment: {...} } ] }
// 3) Nuovo export "Timeline" on-device (Impostazioni → Località → Timeline
//    → Esporta dati sul telefono): un ARRAY diretto (senza chiave wrapper)
//    di oggetti { startTime, endTime, visit: { topCandidate: { placeLocation: "geo:lat,lng" } } }
//    oppure { activity: { start, end } }. Qui "placeLocation" è una STRINGA,
//    non un oggetto con .latLng come nel formato vecchio.
// Proviamo a riconoscere tutti. Il parsing avviene qui, nel browser: mandiamo
// al server solo i punti già estratti (pochi KB anche per anni di cronologia)
// invece del file grezzo, che per export lunghi può pesare decine o
// centinaia di MB e superare il limite di dimensione delle richieste server.
function parseLatLng(value: string): { lat: number; lng: number } | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)°?,\s*(-?\d+(?:\.\d+)?)°?/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

// Un "punto posizione" nei vari formati Google può presentarsi come:
// - stringa "geo:lat,lng" o "lat,lng" (nuovo export Timeline)
// - oggetto { latLng: "lat,lng" } (vecchio formato)
// - oggetto { latitudeE7, longitudeE7 } (Records.json / placeVisit vecchio)
// - oggetto { placeLocation: <uno dei precedenti> } (per comodità, ricorsivo)
function extractLatLng(value: unknown): { lat: number; lng: number } | null {
  if (typeof value === "string") return parseLatLng(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.latitudeE7 === "number" && typeof obj.longitudeE7 === "number") {
      return { lat: obj.latitudeE7 / 1e7, lng: obj.longitudeE7 / 1e7 };
    }
    if (typeof obj.latLng === "string") return parseLatLng(obj.latLng);
    if ("placeLocation" in obj) return extractLatLng(obj.placeLocation);
  }
  return null;
}

// Trova l'array di "segmenti" (visite/spostamenti) qualunque sia la chiave
// che lo contiene — o restituisce direttamente il JSON se è già un array
// (caso del nuovo export on-device, che non ha alcuna chiave wrapper).
function segmentsArrayFrom(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const data = json as Record<string, unknown>;
    if (Array.isArray(data.semanticSegments)) return data.semanticSegments;
    if (Array.isArray(data.timelineObjects)) return data.timelineObjects;
  }
  return [];
}

export function extractTakeoutPoints(json: unknown): Point[] {
  const points: Point[] = [];
  if (!json) return points;

  // Formato Takeout "classico" (Records.json)
  if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).locations)) {
    for (const raw of (json as Record<string, unknown>).locations as unknown[]) {
      const loc = raw as Record<string, unknown>;
      const parsed = extractLatLng(loc);
      const timestamp =
        typeof loc.timestamp === "string"
          ? loc.timestamp
          : typeof loc.timestampMs === "string"
            ? new Date(Number(loc.timestampMs)).toISOString()
            : null;

      if (parsed && timestamp) {
        points.push({ latitude: parsed.lat, longitude: parsed.lng, recorded_at: timestamp });
      }
    }
  }

  // Formato a segmenti: nuovo export on-device (array diretto, chiavi
  // "visit"/"activity") oppure vecchio Semantic Location History
  // (dentro "timelineObjects", chiavi "placeVisit"/"activitySegment").
  for (const raw of segmentsArrayFrom(json)) {
    const segment = raw as Record<string, unknown>;
    const startTime =
      typeof segment.startTime === "string"
        ? segment.startTime
        : typeof segment.startTimestamp === "string"
          ? segment.startTimestamp
          : undefined;

    const visit = (segment.visit ?? segment.placeVisit) as Record<string, unknown> | undefined;
    if (visit && startTime) {
      const topCandidate = visit.topCandidate as Record<string, unknown> | undefined;
      const parsed =
        (topCandidate && extractLatLng(topCandidate.placeLocation)) ??
        extractLatLng(visit.location) ??
        extractLatLng(visit);
      const placeName =
        (topCandidate && typeof topCandidate.semanticType === "string" ? topCandidate.semanticType : undefined) ??
        (visit.location && typeof (visit.location as Record<string, unknown>).name === "string"
          ? ((visit.location as Record<string, unknown>).name as string)
          : undefined);

      if (parsed) {
        points.push({ latitude: parsed.lat, longitude: parsed.lng, recorded_at: startTime, place_name: placeName });
      }
    }

    const activity = (segment.activity ?? segment.activitySegment) as Record<string, unknown> | undefined;
    if (activity && startTime) {
      const parsed =
        extractLatLng(activity.start) ?? extractLatLng((activity as Record<string, unknown>).startLocation);
      if (parsed) {
        points.push({ latitude: parsed.lat, longitude: parsed.lng, recorded_at: startTime });
      }
    }
  }

  return points;
}

// Se l'export ha più punti del limite, NON possiamo semplicemente troncare i
// primi N: gli export multi-anno sono in ordine cronologico, quindi tagliare
// "i primi 20000" scartava sistematicamente tutti gli anni più recenti.
// Campioniamo invece in modo uniforme su tutto l'intervallo temporale, così
// la copertura resta dagli anni più vecchi fino ad oggi.
export function capPoints(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const sampled: Point[] = [];
  for (let i = 0; i < max; i++) {
    sampled.push(points[Math.floor(i * step)]);
  }
  return sampled;
}

// Invia i punti al server a piccoli blocchi, così anche export enormi non
// creano un'unica richiesta troppo grande e l'utente vede un avanzamento.
export async function sendPointsInChunks(
  points: Point[],
  source: PendingImportSource,
  onProgress: (inserted: number, total: number) => void
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < points.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = points.slice(i, i + IMPORT_CHUNK_SIZE);
    const res = await fetch("/api/locations/import-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: chunk, source }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(inserted > 0 ? `partial:${inserted}` : data?.error || "import_failed");
    }
    inserted += data.inserted ?? chunk.length;
    onProgress(inserted, points.length);
  }
  return inserted;
}

/** Legge e valida un file JSON di Google Takeout/Timeline, pronto per sendPointsInChunks. */
export async function parseTakeoutFile(file: File): Promise<Point[]> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error(
      "Il file non è un JSON valido. Assicurati di aver esportato il file corretto da Google Takeout."
    );
  }
  const points = capPoints(extractTakeoutPoints(json), MAX_TAKEOUT_POINTS);
  if (points.length === 0) {
    throw new Error(
      "Non ho trovato spostamenti in questo file. Controlla di aver esportato il file corretto da Google Takeout."
    );
  }
  return points;
}

/**
 * Estrae posizione + data/ora dai metadati EXIF di una lista di foto.
 * L'analisi avviene interamente sul telefono: le foto non vengono mai
 * caricate, estraiamo solo i dati GPS dagli scatti che li contengono
 * (screenshot o foto scaricate da chat di solito non ne hanno, e vengono
 * semplicemente ignorati).
 */
export async function extractPointsFromPhotos(
  files: File[]
): Promise<{ points: Point[]; unreadable: number }> {
  let exifr: any;
  try {
    const mod: any = await import("exifr");
    exifr = mod?.default ?? mod;
    if (!exifr?.gps) throw new Error("exifr_not_available");
  } catch (err) {
    console.error("Impossibile caricare il modulo di analisi foto", err);
    throw new Error("Impossibile avviare l'analisi delle foto. Controlla la connessione e riprova.");
  }

  const points: Point[] = [];
  let unreadable = 0;

  for (const file of files) {
    try {
      const gps = await exifr.gps(file);
      if (!gps || typeof gps.latitude !== "number" || typeof gps.longitude !== "number") continue;

      const meta = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
      const takenAt: Date =
        meta?.DateTimeOriginal instanceof Date
          ? meta.DateTimeOriginal
          : meta?.CreateDate instanceof Date
            ? meta.CreateDate
            : new Date(file.lastModified);

      points.push({
        latitude: gps.latitude,
        longitude: gps.longitude,
        recorded_at: takenAt.toISOString(),
      });
    } catch (err) {
      unreadable++;
      console.error("Foto illeggibile", file.name, err);
    }
  }

  return { points, unreadable };
}
