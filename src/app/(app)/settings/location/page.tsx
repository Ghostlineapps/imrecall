"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";

const TRACKING_STORAGE_KEY = "imrecall_location_tracking_enabled";
const TRACKING_INTERVAL_MS = 10 * 60 * 1000; // ogni 10 minuti

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function LocationSettingsPage() {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [tracking, setTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
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
  }, [tracking]);

  function sendCurrentPosition() {
    if (!navigator.geolocation) {
      setTrackingError("Il browser non supporta la geolocalizzazione.");
      return;
    }

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
  }

  function toggleTracking() {
    const next = !tracking;
    setTracking(next);
    window.localStorage.setItem(TRACKING_STORAGE_KEY, String(next));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMessage(null);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/locations/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setImportError(data?.error === "no_points_found"
          ? "Non ho trovato spostamenti in questo file. Controlla di aver esportato il file corretto da Google Takeout."
          : "Importazione fallita. Riprova.");
      } else {
        setImportMessage(`Importati ${data.inserted} spostamenti.`);
      }
    } catch {
      setImportError("Errore di connessione durante l'importazione.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handleSearch() {
    if (!searchDate || !searchTime) {
      setSearchError("Inserisci sia la data che l'ora.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const at = new Date(`${searchDate}T${searchTime}:00`).toISOString();
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
    <div className="px-4 pt-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-white/50 text-sm">
          ← Impostazioni
        </Link>
      </div>

      <h1 className="text-xl font-semibold">Spostamenti</h1>

      <div className="card space-y-3">
        <div>
          <p className="font-medium">Importa da Google Maps</p>
          <p className="text-sm text-white/50 mt-1">
            Scarica la tua cronologia spostamenti da Google Takeout (o dall&apos;export Timeline
            del telefono) e caricala qui per importarla in IMRECALL.
          </p>
        </div>

        <label className="btn-primary w-full text-center cursor-pointer inline-block">
          {importing ? "Importazione in corso…" : "Scegli file JSON"}
          <input
            type="file"
            accept="application/json"
            onChange={handleImport}
            disabled={importing}
            className="hidden"
          />
        </label>

        {importMessage && <p className="text-sm text-primary-light">{importMessage}</p>}
        {importError && <p className="text-urgent text-sm">{importError}</p>}
      </div>

      <div className="card space-y-3">
        <div>
          <p className="font-medium">Tracciamento posizione da oggi</p>
          <p className="text-sm text-white/50 mt-1">
            Da questo momento, IMRECALL può salvare periodicamente la tua posizione mentre tieni
            questa pagina aperta nel browser. Nota: sui browser mobili (specialmente iPhone) il
            tracciamento si interrompe se chiudi la scheda o l&apos;app.
          </p>
        </div>

        <button onClick={toggleTracking} className="btn-primary w-full">
          {tracking ? "Disattiva tracciamento" : "Attiva tracciamento"}
        </button>

        {tracking && lastPing && (
          <p className="text-sm text-white/40">Ultima posizione salvata alle {lastPing}</p>
        )}
        {trackingError && <p className="text-urgent text-sm">{trackingError}</p>}
      </div>

      <div className="card space-y-3">
        <div>
          <p className="font-medium">Dove mi trovavo?</p>
          <p className="text-sm text-white/50 mt-1">
            Scegli data e ora: IMRECALL cerca lo spostamento registrato più vicino a quel momento.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="input-field flex-1"
          />
          <input
            type="time"
            value={searchTime}
            onChange={(e) => setSearchTime(e.target.value)}
            className="input-field flex-1"
          />
        </div>

        <button onClick={handleSearch} disabled={searching} className="btn-primary w-full">
          {searching ? "Cerco…" : "Cerca"}
        </button>

        {searchError && <p className="text-urgent text-sm">{searchError}</p>}

        {searchResult && (
          <div className="pt-2 border-t border-white/10">
            <p className="text-sm">
              {searchResult.place_name || `${searchResult.latitude.toFixed(5)}, ${searchResult.longitude.toFixed(5)}`}
            </p>
            <p className="text-xs text-white/40 mt-1">
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
          <p className="text-sm text-white/40 px-1">
            Nessuno spostamento registrato ancora. Importa da Google Maps o attiva il
            tracciamento qui sopra.
          </p>
        )}

        {locations.map((loc: any) => (
          <div key={loc.id} className="card py-2.5 flex items-center justify-between">
            <div>
              <p className="text-sm">
                {loc.place_name || `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`}
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                {new Date(loc.recorded_at).toLocaleString("it-IT")}
              </p>
            </div>
            <span className="text-xs text-white/30 capitalize">{loc.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
