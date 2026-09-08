"use client";

import { useEffect, useRef } from "react";
import { ensureNativeLocationPermission, isNativeTrackingAvailable } from "@/lib/utils/nativeGeolocation";

const TRACKING_STORAGE_KEY = "imrecall_location_tracking_enabled";
const TRACKING_INTERVAL_MS = 10 * 60 * 1000; // ogni 10 minuti

// Evento personalizzato: settings/location/page.tsx lo lancia subito dopo
// aver cambiato TRACKING_STORAGE_KEY, così questo hook (montato altrove,
// nel layout) reagisce all'istante invece di aspettare un remount o un
// evento "storage" (che comunque non scatta mai per lo stesso tab che ha
// scritto la chiave — solo per le altre schede).
export const TRACKING_TOGGLE_EVENT = "imrecall:tracking-toggled";

/**
 * Bug reale trovato il 2026-09-07 (segnalato dall'utente: partito da
 * Mariotto, passato per Terlizzi, arrivato a Giovinazzo con l'app aperta e
 * lo schermo spento — la schermata "Spostamenti" mostrava ancora l'ultima
 * posizione di 23 minuti prima, di un altro paese).
 *
 * Causa: il fallback iOS/web a setInterval (con il re-ping su
 * visibilitychange aggiunto il giorno prima) viveva SOLO dentro
 * settings/location/page.tsx — esattamente lo stesso errore già trovato e
 * corretto per il watchdog nativo Android il 2026-09-06. Nessuno tiene
 * aperta la pagina Impostazioni → Spostamenti mentre guida: quel componente
 * non è mai montato, quindi né l'intervallo né il re-ping sono mai partiti,
 * per l'intero viaggio.
 *
 * Questo hook, montato una sola volta nel layout dell'app, ripete la stessa
 * logica ma resta attivo su QUALSIASI schermata. Non risolve — e non può
 * risolvere lato web — il fatto che con lo schermo bloccato iOS sospende
 * comunque tutto il JavaScript della pagina (nessun punto verrà salvato
 * durante il tragitto stesso, incluso il passaggio da Terlizzi): quello
 * richiede l'app nativa iOS di cui si è già parlato. Quello che questo hook
 * garantisce è che, appena riapri IMRECALL su QUALSIASI schermata dopo aver
 * sbloccato il telefono, la posizione si aggiorni subito alla tua posizione
 * attuale invece di restare ferma all'ultimo punto registrato prima di
 * bloccare lo schermo.
 */
export function useLocationFallbackTracking() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPingAtRef = useRef<number>(0);
  const nativeAvailableRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function sendCurrentPosition() {
      if (!navigator.geolocation) return;
      ensureNativeLocationPermission().finally(() => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
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
            } catch {
              // Silenzioso: questo hook non ha una UI che ascolti l'errore,
              // riproverà comunque al prossimo tick/evento.
            }
          },
          () => {
            // Silenzioso per lo stesso motivo.
          },
          { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 15000 }
        );
      });
    }

    function startInterval() {
      if (intervalRef.current) return;
      lastPingAtRef.current = Date.now();
      sendCurrentPosition();
      intervalRef.current = setInterval(() => {
        lastPingAtRef.current = Date.now();
        sendCurrentPosition();
      }, TRACKING_INTERVAL_MS);
    }

    function stopInterval() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function syncFromStorage() {
      // Il nativo Android ha il suo Foreground Service (vedi
      // useNativeTrackingWatchdog.ts) — questo fallback web/iOS resta spento
      // quando è disponibile, per non duplicare i punti.
      if (nativeAvailableRef.current) return;
      const enabled = window.localStorage.getItem(TRACKING_STORAGE_KEY) === "true";
      if (enabled) startInterval();
      else stopInterval();
    }

    function pingIfStale() {
      if (document.visibilityState !== "visible") return;
      if (nativeAvailableRef.current) return;
      if (window.localStorage.getItem(TRACKING_STORAGE_KEY) !== "true") return;
      // Era 2 minuti: abbassata a 1 dopo il bug del 2026-09-07 (Mariotto →
      // Terlizzi → Giovinazzo) per recuperare più in fretta il ritardo
      // quando si riapre l'app dopo che lo schermo è rimasto spento a
      // lungo — resta comunque un debounce vero, non un ping ad ogni
      // sblocco: un rapido cambio di tab/app entro il minuto non fa
      // scattare una nuova richiesta GPS.
      if (Date.now() - lastPingAtRef.current < 60 * 1000) return;
      lastPingAtRef.current = Date.now();
      sendCurrentPosition();
    }

    (async () => {
      nativeAvailableRef.current = await isNativeTrackingAvailable();
      if (cancelled) return;
      syncFromStorage();
    })();

    document.addEventListener("visibilitychange", pingIfStale);
    window.addEventListener(TRACKING_TOGGLE_EVENT, syncFromStorage);
    window.addEventListener("storage", syncFromStorage);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", pingIfStale);
      window.removeEventListener(TRACKING_TOGGLE_EVENT, syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);
}
