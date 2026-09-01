"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ensureNativeLocationPermission,
  isNativeTrackingAvailable,
  requestBackgroundLocationPermission,
  startNativeTracking,
  stopNativeTracking,
} from "@/lib/utils/nativeGeolocation";
const TRACKING_STORAGE_KEY = "imrecall_location_tracking_enabled";
const TRACKING_INTERVAL_MS = 10 * 60 * 1000; // ogni 10 minuti
const MAX_TAKEOUT_POINTS = 60000;
const IMPORT_CHUNK_SIZE = 2000;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Point = { latitude: number; longitude: number; recorded_at: string; place_name?: string };

// Google esporta la cronologia spostamenti in diversi formati:
// 1) Takeout classico "Records.json": { locations: [ { latitudeE7, longitudeE7, timestamp } ] }
// 2) Takeout "Semantic Location History" (dismesso da Google): oggetto con
//    { timelineObjects: [ { placeVisit: {...} } | { activitySegment: {...} } ] }
// 3) Nuovo export "Timeline" on-device (Impostazioni → Località → Timeline
//    → Esporta dati sul telefono): un ARRAY diretto (senza chiave wrapper)
//    di oggetti { startTime, endTime, visit: { topCandidate: { placeLocation: "geo:lat,lng" } } }
//    oppure { activity: { start, end } }. Qui "placeLocation" è una STRINGA,
//    non un oggetto con .latLng come nel formato vecchio.
// Proviamo a riconoscere tutti. Il parsing avviene qui, nel browser:
// mandiamo al server solo i punti già estratti (pochi KB anche per anni di
// cronologia) invece del file grezzo, che per export lunghi può pesare
// decine o centinaia di MB e superare il limite di dimensione delle
// richieste del server.
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

function extractTakeoutPoints(json: unknown): Point[] {
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

// Se l'export ha più punti del limite, NON possiamo semplicemente troncare
// i primi N: gli export multi-anno sono in ordine cronologico, quindi
// tagliare "i primi 20000" scartava sistematicamente tutti gli anni più
// recenti (è esattamente il motivo per cui "Dove mi trovavo?" non trovava
// nulla per date recenti, pur avendo importato 20000 punti). Campioniamo
// invece in modo uniforme su tutto l'intervallo temporale, così la
// copertura resta dagli anni più vecchi fino ad oggi.
function capPoints(points: Point[], max: number): Point[] {
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
async function sendPointsInChunks(
  points: Point[],
  source: "import" | "photo",
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

// 2026-08-26: palette celeste (quattordicesima schermata convertita).
export default function LocationSettingsPage() {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [photoImporting, setPhotoImporting] = useState(false);
  const [photoImportMessage, setPhotoImportMessage] = useState<string | null>(null);
  const [photoImportError, setPhotoImportError] = useState<string | null>(null);

  const [tracking, setTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dentro l'app nativa Android il tracciamento gira in un Foreground
  // Service con geofencing + campionamento adattivo (vedi
  // nativeGeolocation.ts), non più nel setInterval qui sotto — quello resta
  // solo come fallback per chi usa il sito da un browser desktop/mobile.
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    isNativeTrackingAvailable().then(setNativeAvailable);
  }, []);

  const { data: locationsData } = useSWR("/api/locations?limit=50", fetcher);
  const locations = locationsData?.locations ?? [];

  const [searchDate, setSearchDate] = useState("");
  const [searchTime, setSearchTime] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<any>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    if (saved === "true") setTracking(true);
  }, []);

  // Il bottone qui sopra riflette solo una preferenza salvata in
  // localStorage ("l'utente vuole il tracciamento attivo"), ma il vero
  // Foreground Service Android che lo esegue davvero può NON essere in
  // esecuzione anche se questa preferenza dice "true" — es. dopo una
  // reinstallazione/aggiornamento dell'app, o se Android ha comunque
  // ucciso il processo. Senza questo effetto l'interfaccia mostrava
  // "tracciamento attivo" mentre in realtà nessun servizio girava e
  // nessuna notifica compariva, finché l'utente non disattivava e
  // riattivava manualmente. Qui, appena il ponte nativo è disponibile, se
  // la preferenza salvata è "true" ri-avviamo il servizio (le richieste di
  // permesso già concessi si risolvono subito senza mostrare popup).
  useEffect(() => {
    if (!nativeAvailable) return;
    if (window.localStorage.getItem(TRACKING_STORAGE_KEY) !== "true") return;

    (async () => {
      const granted = await requestBackgroundLocationPermission();
      if (!granted) {
        setTrackingError(
          "Serve il permesso di posizione \"sempre consentita\" per il tracciamento in background. Abilitalo nelle impostazioni di sistema dell'app."
        );
        setTracking(false);
        window.localStorage.setItem(TRACKING_STORAGE_KEY, "false");
        return;
      }
      const started = await startNativeTracking();
      if (!started) {
        setTrackingError("Impossibile riavviare il tracciamento nativo.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAvailable]);

  useEffect(() => {
    // Su nativo il tracciamento è gestito dal Foreground Service Android
    // (avviato/fermato da toggleTracking), non da questo intervallo nel tab.
    if (nativeAvailable) return;

    if (!tracking) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    sendCurrentPosition();
    intervalRef.current = setInterval(sendCurrentPosition, TRACKING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, nativeAvailable]);

  function sendCurrentPosition() {
    if (!navigator.geolocation) {
      setTrackingError("Il browser non supporta la geolocalizzazione.");
      return;
    }

      // Dentro l'app nativa Android il vero permesso di sistema va chiesto
      // esplicitamente tramite il plugin Capacitor – vedi nativeGeolocation.ts.
      // Su web/PWA non fa nulla.
      ensureNativeLocationPermission().finally(() => {
      navigator.geolocation.getCurrentPosition(
      async (position) => {
        setTrackingError(null);
        try {
          await fetch("/api/locations/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              recorded_at: new Date(position.timestamp).toISOString(),
            }),
          });
          setLastPing(new Date().toLocaleTimeString("it-IT"));
        } catch {
          setTrackingError("Errore nell'invio della posizione al server.");
        }
      },
      (err) => {
        setTrackingError(
          err.code === err.PERMISSION_DENIED
            ? "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser."
            : "Impossibile ottenere la posizione attuale."
        );
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 15000 }
    );
      });
  }

  async function toggleTracking() {
    const next = !tracking;

    if (nativeAvailable) {
      if (next) {
        // Il permesso "posizione sempre consentita" va chiesto esplicitamente
        // (separato dal permesso in foreground su Android 10+): senza,
        // geofencing e tracking si fermerebbero non appena l'app va in
        // background, vanificando lo scopo del Foreground Service.
        const granted = await requestBackgroundLocationPermission();
        if (!granted) {
          setTrackingError(
            "Serve il permesso di posizione \"sempre consentita\" per il tracciamento in background. Abilitalo nelle impostazioni di sistema dell'app."
          );
          return;
        }
        const started = await startNativeTracking();
        if (!started) {
          setTrackingError("Impossibile avviare il tracciamento nativo.");
          return;
        }
      } else {
        await stopNativeTracking();
      }
    }

    setTracking(next);
    setTrackingError(null);
    window.localStorage.setItem(TRACKING_STORAGE_KEY, String(next));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMessage(null);
    setImportError(null);

    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        setImportError(
          "Il file non è un JSON valido. Assicurati di aver esportato il file corretto da Google Takeout."
        );
        return;
      }

      const points = capPoints(extractTakeoutPoints(json), MAX_TAKEOUT_POINTS);
      if (points.length === 0) {
        setImportError(
          "Non ho trovato spostamenti in questo file. Controlla di aver esportato il file corretto da Google Takeout."
        );
        return;
      }

      const inserted = await sendPointsInChunks(points, "import", (done, total) =>
        setImportMessage(`Importazione in corso… ${done}/${total}`)
      );
      setImportMessage(`Importati ${inserted} spostamenti.`);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      setImportError(
        msg.startsWith("partial:")
          ? `Importazione interrotta dopo ${msg.split(":")[1]} spostamenti. Riprova per completare.`
          : "Importazione fallita. Controlla la connessione e riprova."
      );
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handlePhotoImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setPhotoImporting(true);
    setPhotoImportMessage(null);
    setPhotoImportError(null);

    try {
      // L'analisi EXIF avviene interamente sul telefono: le foto non vengono
      // mai caricate, estraiamo solo posizione e data/ora dagli scatti che
      // le contengono (screenshot o foto scaricate da chat di solito non ne
      // hanno, e vengono semplicemente ignorati).
      let exifr: any;
      try {
        const mod: any = await import("exifr");
        exifr = mod?.default ?? mod;
        if (!exifr?.gps) throw new Error("exifr_not_available");
      } catch (err) {
        console.error("Impossibile caricare il modulo di analisi foto", err);
        setPhotoImportError("Impossibile avviare l'analisi delle foto. Controlla la connessione e riprova.");
        return;
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

      if (points.length === 0) {
        setPhotoImportError(
          unreadable === files.length
            ? "Non sono riuscito ad analizzare queste foto. Prova con foto scattate direttamente dalla fotocamera (non screenshot o immagini scaricate da una chat)."
            : "Nessuna delle foto selezionate contiene dati di posizione (GPS). Gli screenshot o le foto con la posizione disattivata non ne hanno."
        );
        return;
      }

      const inserted = await sendPointsInChunks(points, "photo", () => {});
      const skipped = files.length - points.length;
      setPhotoImportMessage(
        `Importati ${inserted} spostamenti da foto` +
          (skipped > 0 ? ` (${skipped} foto senza dati di posizione ignorate).` : ".")
      );
    } catch (err) {
      console.error(err);
      setPhotoImportError("Errore durante l'analisi delle foto. Riprova.");
    } finally {
      setPhotoImporting(false);
      e.target.value = "";
    }
  }

  async function handleSearch() {
    if (!searchDate) {
      setSearchError("Inserisci almeno la data.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      // L'ora è opzionale: se non specificata, cerchiamo lo spostamento più
      // vicino a mezzogiorno di quel giorno. Non è "l'ora esatta", ma è
      // un'ancora ragionevole per trovare il punto registrato più
      // rappresentativo di quella data senza costringere l'utente a
      // ricordare un orario preciso che spesso non conosce.
      const at = new Date(`${searchDate}T${searchTime || "12:00"}:00`).toISOString();
      const res = await fetch(`/api/locations/at?at=${encodeURIComponent(at)}`);
      const data = await res.json();

      if (!res.ok) {
        setSearchError("Ricerca fallita. Riprova.");
      } else if (!data.match) {
        setSearchError("Nessuno spostamento registrato vicino a quel momento.");
      } else {
        setSearchResult(data.match);
      }
    } catch {
      setSearchError("Errore di connessione durante la ricerca.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <h1 className="text-xl font-semibold">Spostamenti</h1>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Importa da Google Maps</p>
          <p className="text-sm text-celeste-muted mt-1">
            Scarica la tua cronologia spostamenti da Google Takeout (o dall&apos;export Timeline
            del telefono) e caricala qui per importarla in IMRECALL. Il file viene letto sul
            telefono: anche export molto grandi funzionano.
          </p>
        </div>

        <label className="btn-primary-light w-full text-center cursor-pointer inline-block">
          {importing ? "Importazione in corso…" : "Scegli file JSON"}
          <input
            type="file"
            accept="application/json"
            onChange={handleImport}
            disabled={importing}
            className="hidden"
          />
        </label>

        {importMessage && <p className="text-sm text-celeste-accent">{importMessage}</p>}
        {importError && <p className="text-urgent text-sm">{importError}</p>}
      </div>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Importa dalle foto</p>
          <p className="text-sm text-celeste-muted mt-1">
            Seleziona foto dalla galleria: se contengono la posizione (GPS), la aggiungiamo ai
            tuoi spostamenti. Funziona con le foto scattate dalla fotocamera con i servizi di
            localizzazione attivi — screenshot e immagini scaricate da chat di solito non hanno
            questo dato. Le foto restano sul telefono, non vengono caricate.
          </p>
        </div>

        <label className="btn-primary-light w-full text-center cursor-pointer inline-block">
          {photoImporting ? "Analisi in corso…" : "Scegli foto"}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoImport}
            disabled={photoImporting}
            className="hidden"
          />
        </label>

        {photoImportMessage && <p className="text-sm text-celeste-accent">{photoImportMessage}</p>}
        {photoImportError && <p className="text-urgent text-sm">{photoImportError}</p>}
      </div>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Tracciamento posizione da oggi</p>
          <p className="text-sm text-celeste-muted mt-1">
            Da questo momento, IMRECALL può salvare periodicamente la tua posizione mentre tieni
            questa pagina aperta nel browser. Nota: sui browser mobili (specialmente iPhone) il
            tracciamento si interrompe se chiudi la scheda o l&apos;app.
          </p>
        </div>

        <button onClick={toggleTracking} className="btn-primary-light w-full">
          {tracking ? "Disattiva tracciamento" : "Attiva tracciamento"}
        </button>

        {tracking && lastPing && (
          <p className="text-sm text-celeste-muted">Ultima posizione salvata alle {lastPing}</p>
        )}
        {trackingError && <p className="text-urgent text-sm">{trackingError}</p>}
      </div>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Dove mi trovavo?</p>
          <p className="text-sm text-celeste-muted mt-1">
            Scegli una data (l&apos;ora è facoltativa): IMRECALL cerca lo spostamento registrato
            più vicino a quel momento.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="input-field-light flex-1"
          />
          <input
            type="time"
            value={searchTime}
            onChange={(e) => setSearchTime(e.target.value)}
            placeholder="Opzionale"
            className="input-field-light flex-1"
          />
        </div>

        <button onClick={handleSearch} disabled={searching} className="btn-primary-light w-full">
          {searching ? "Cerco…" : "Cerca"}
        </button>

        {searchError && <p className="text-urgent text-sm">{searchError}</p>}

        {searchResult && (
          <div className="pt-2 border-t border-celeste-navy/10">
            <p className="text-sm">
              {searchResult.place_name || `${searchResult.latitude.toFixed(5)}, ${searchResult.longitude.toFixed(5)}`}
            </p>
            <p className="text-xs text-celeste-muted mt-1">
              Registrato alle {new Date(searchResult.recorded_at).toLocaleString("it-IT")}
              {searchResult.diff_minutes > 15 &&
                ` (~${searchResult.diff_minutes} minuti dall'orario cercato)`}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="font-medium px-1">I tuoi ultimi spostamenti</p>

        {locations.length === 0 && (
          <p className="text-sm text-celeste-muted px-1">
            Nessuno spostamento registrato ancora. Importa da Google Maps, dalle foto o attiva il
            tracciamento qui sopra.
          </p>
        )}

        {locations.map((loc: any) => (
          <div key={loc.id} className="card-light py-2.5 flex items-center justify-between">
            <div>
              <p className="text-sm">
                {loc.place_name || `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`}
              </p>
              <p className="text-xs text-celeste-muted mt-0.5">
                {new Date(loc.recorded_at).toLocaleString("it-IT")}
              </p>
            </div>
            <span className="text-xs text-celeste-muted capitalize">{loc.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
