"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ensureNativeLocationPermission,
  getTrackingServiceDebugInfo,
  isNativeTrackingAvailable,
  requestBackgroundLocationPermission,
  startNativeTracking,
  stopNativeTracking,
} from "@/lib/utils/nativeGeolocation";
import { extractPointsFromPhotos, parseTakeoutFile, sendPointsInChunks } from "@/lib/import/locationImport";

const TRACKING_STORAGE_KEY = "imrecall_location_tracking_enabled";
const TRACKING_INTERVAL_MS = 10 * 60 * 1000; // ogni 10 minuti

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// 2026-09-02: il parsing Takeout/EXIF condiviso con /onboarding è stato
// spostato in src/lib/import/locationImport.ts — vedi quel file per i
// dettagli sui formati Google riconosciuti e la logica di campionamento.

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
  const lastPingAtRef = useRef<number>(0);

  // Dentro l'app nativa Android il tracciamento gira in un Foreground
  // Service con geofencing + campionamento adattivo (vedi
  // nativeGeolocation.ts), non più nel setInterval qui sotto — quello resta
  // solo come fallback per chi usa il sito da un browser desktop/mobile.
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    isNativeTrackingAvailable().then((v) => {
      if (v) setNativeAvailable(true);
    });
  }, []);

  // Diagnostica: dice se il Foreground Service è DAVVERO partito o se è
  // fallito con un errore specifico (vedi TrackingDebugState.java) —
  // refreshTrackingDebug è richiamabile a mano dal pulsante qui sotto,
  // perché lo stato cambia solo dopo aver toccato Attiva/Disattiva
  // tracciamento.
  const [serviceDebug, setServiceDebug] = useState<string | null>(null);
  async function refreshTrackingDebug() {
    const info = await getTrackingServiceDebugInfo();
    if (!info) {
      setServiceDebug("(nessun ponte nativo disponibile)");
      return;
    }
    const when = info.lastStartAt ? new Date(info.lastStartAt).toLocaleTimeString("it-IT") : "-";
    setServiceDebug(`servizio in esecuzione:${info.running} ultimo avvio:${when} ultimo errore:${info.lastError ?? "-"}`);
  }
  useEffect(() => {
    if (!nativeAvailable) return;
    refreshTrackingDebug();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAvailable]);

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

    lastPingAtRef.current = Date.now();
    sendCurrentPosition();
    intervalRef.current = setInterval(() => {
      lastPingAtRef.current = Date.now();
      sendCurrentPosition();
    }, TRACKING_INTERVAL_MS);

    // Bug reale trovato il 2026-09-06 (segnalato dall'utente, verificato sui
    // dati): questo ramo è l'UNICO usato su iOS — non esiste una cartella
    // ios/ in questo repo, solo android/, quindi su iPhone il Foreground
    // Service nativo non esiste affatto, sempre e comunque, a prescindere
    // da qualunque riavvio lato Android. Su iOS Safari/PWA, questo
    // setInterval viene sospeso dal sistema appena la pagina non è in primo
    // piano — stesso comportamento già documentato in useLocationCheckin.ts.
    // Prova sui dati reali: uscita del 5 settembre (iPhone), punti ogni
    // 60-100 minuti invece che ogni 10. Qui replichiamo la stessa
    // mitigazione già in uso in useLocationCheckin.ts: un ping immediato al
    // ritorno in primo piano, invece di aspettare il prossimo tick che su
    // iOS potrebbe non arrivare mai. Non è tracciamento realtime in
    // background — su iOS senza un'app nativa vera e propria (con
    // CLLocationManager e background modes) non è ottenibile in nessun
    // modo — ma riduce lo scarto tra dove sei davvero e l'ultimo punto
    // salvato ogni volta che riapri l'app, invece di scoprirlo solo al
    // prossimo tick programmato.
    function pingIfStale() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastPingAtRef.current < 2 * 60 * 1000) return;
      lastPingAtRef.current = Date.now();
      sendCurrentPosition();
    }
    document.addEventListener("visibilitychange", pingIfStale);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", pingIfStale);
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

    let points;
    try {
      points = await parseTakeoutFile(file);
    } catch (err: any) {
      // Errori di parsing/validazione: messaggi già pensati per l'utente
      // (file non valido, nessuno spostamento trovato), sicuri da mostrare
      // così come sono.
      setImportError(err?.message || "Importazione fallita. Controlla la connessione e riprova.");
      setImporting(false);
      e.target.value = "";
      return;
    }

    try {
      const inserted = await sendPointsInChunks(points, "import", (done, total) =>
        setImportMessage(`Importazione in corso… ${done}/${total}`)
      );
      setImportMessage(`Importati ${inserted} spostamenti.`);
    } catch (err: any) {
      // Qui l'errore può arrivare dal server (rete, sessione scaduta...):
      // non lo mostriamo mai grezzo, solo il caso "parziale" è specifico.
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
      let points, unreadable;
      try {
        ({ points, unreadable } = await extractPointsFromPhotos(files));
      } catch (err: any) {
        setPhotoImportError(err?.message || "Impossibile avviare l'analisi delle foto. Controlla la connessione e riprova.");
        return;
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
        {serviceDebug && <p className="text-[10px] text-celeste-muted/60 break-all">{serviceDebug}</p>}
        {nativeAvailable && (
          <button onClick={refreshTrackingDebug} className="text-[10px] underline text-celeste-muted/60">
            Aggiorna diagnostica
          </button>
        )}
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
