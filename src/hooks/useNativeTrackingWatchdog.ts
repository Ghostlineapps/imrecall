"use client";

import { useEffect } from "react";
import {
  isNativeTrackingAvailable,
  requestBackgroundLocationPermission,
  startNativeTracking,
} from "@/lib/utils/nativeGeolocation";

// Stessa chiave usata in settings/location/page.tsx: "l'utente vuole il
// tracciamento attivo". Duplicata qui invece che importata perché quel file
// è una pagina, non un modulo condiviso — spostarla in una costante comune
// è un miglioramento futuro, non urgente.
const TRACKING_STORAGE_KEY = "imrecall_location_tracking_enabled";

/**
 * Bug reale trovato il 2026-09-06, root cause del "il tracciamento non si
 * aggiorna in tempo reale / non riconosce i posti quando ci sei": il
 * riavvio automatico del Foreground Service nativo (necessario perché
 * Android può ucciderlo per pressione di memoria o battery-saver — vedi
 * commento in settings/location/page.tsx) viveva SOLO in quella pagina
 * impostazioni. Se il servizio muore mentre l'utente è in giro e non apre
 * mai Impostazioni → Spostamenti, resta morto per sempre: l'interfaccia
 * continua a mostrare "tracciamento attivo" (la preferenza in localStorage
 * dice ancora true) ma nessun punto arriva più.
 *
 * Prova concreta dai dati reali (query diretta a location_checkins,
 * 2026-09-06): le sorgenti "live_sparse"/"live_stop" del servizio nativo
 * smettono di comparire dopo il 4 settembre alle 15:57 — proprio durante
 * l'uscita del 5 settembre (pranzo/cena a Caserta) restano solo punti
 * "live" (il vecchio fallback a tab aperta, con buchi di 60-100 minuti) e
 * "checkin" (all'apertura dell'app). Il servizio nativo era morto e nessuno
 * lo aveva mai fatto ripartire.
 *
 * Questo hook, montato una sola volta nel layout dell'app (non nella
 * pagina impostazioni), ripete lo stesso controllo di
 * settings/location/page.tsx ma ad OGNI apertura dell'app, su qualunque
 * schermata — così il servizio si auto-ripara appena l'utente riapre
 * IMRECALL, invece di restare morto finché non visita per caso le
 * impostazioni. Non risolve la causa a monte (Android/il produttore del
 * telefono che uccide il processo in background — un limite di piattaforma
 * che nessun codice lato app può eliminare del tutto), ma riduce
 * drasticamente per quanto tempo resta rotto.
 */
export function useNativeTrackingWatchdog() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const available = await isNativeTrackingAvailable();
      if (cancelled || !available) return;

      if (window.localStorage.getItem(TRACKING_STORAGE_KEY) !== "true") return;

      const granted = await requestBackgroundLocationPermission();
      if (cancelled || !granted) return;

      // startTracking() lato nativo è già protetto da una guardia contro i
      // doppi avvii (vedi commento in LocationTrackingService.onStartCommand),
      // quindi richiamarlo anche quando il servizio è già vivo è innocuo.
      await startNativeTracking();
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
