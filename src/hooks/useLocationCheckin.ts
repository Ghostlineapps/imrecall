"use client";

import { useEffect } from "react";
import { ensureNativeLocationPermission } from "@/lib/utils/nativeGeolocation";
import { isGeoPermissionKnownGranted, markGeoPermissionGranted } from "@/lib/utils/geoPermission";

// Prima del primo grant, non ripetere il check-in più di una volta ogni 6
// ore: su iOS, un'app aggiunta alla Home è una nuova sessione della WebView
// ad ogni lancio, e sessionStorage — usato qui prima — si azzera insieme ad
// essa. Il risultato percepito dall'utente: il prompt di posizione
// ricompare ogni singola volta che apre l'app (segnalato 2026-08-21).
// Passando a localStorage con un timeout esplicito, il check-in avviene al
// massimo una volta ogni 6 ore prima che il permesso sia concesso, non ad
// ogni apertura.
//
// Dopo il primo grant, invece, richiedere di nuovo la posizione non mostra
// alcun prompt: niente più cooldown, ripetiamo il check-in da soli ogni
// CHECKIN_REFRESH_MS finché l'app resta aperta (vedi startAutoRefresh
// sotto). Aggiunto 2026-09-03: prima, con l'app aperta e in mano, "sei di
// nuovo qui" restava fermo alla posizione del primo check-in della sessione
// (fino a 6 ore prima) finché non si toccava manualmente "posizione
// attuale" — su iOS in particolare, dove non c'è comunque modo di
// aggiornare la posizione ad app chiusa/schermo bloccato (limite di
// sistema, non risolvibile da una PWA).
const CHECKIN_COOLDOWN_MS = 1000 * 60 * 60 * 6; // pre-grant, invariato
const CHECKIN_REFRESH_MS = 1000 * 60 * 5; // post-grant: ogni 5 minuti
const CHECKIN_STORAGE_KEY = "imrecall_checkin_at";

/**
 * Richiede la posizione e la invia a /api/checkin per generare eventuali
 * candidati di resurfacing di prossimità. Prima del primo grant del
 * permesso, al massimo una volta ogni CHECKIN_COOLDOWN_MS; dopo, si
 * ripete da sola ogni CHECKIN_REFRESH_MS mentre l'app resta aperta.
 */
export function useLocationCheckin() {
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    // Segna il tentativo subito, sia in caso di successo che di rifiuto:
    // altrimenti un utente che nega il permesso verrebbe ri-interpellato
    // alla prossima apertura invece che dopo il cooldown.
    const markAttempted = () => localStorage.setItem(CHECKIN_STORAGE_KEY, String(Date.now()));

    function startAutoRefresh() {
      if (refreshTimer || cancelled) return;
      refreshTimer = setInterval(() => {
        if (!cancelled) doCheckin();
      }, CHECKIN_REFRESH_MS);
    }

    function doCheckin() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          markAttempted();
          markGeoPermissionGranted();
          startAutoRefresh();
          try {
            await fetch("/api/checkin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
            });
          } catch {
            // silenzioso: il check-in è un miglioramento opportunistico, non
            // deve mai bloccare l'esperienza dell'utente
          }
        },
        () => {
          // permesso negato: l'app funziona comunque, solo senza resurfacing
          // di prossimità. Segniamo comunque il tentativo per rispettare il
          // cooldown ed evitare di richiederlo di nuovo alla prossima apertura.
          markAttempted();
        },
        { maximumAge: 1000 * 60 * 2 }
      );
    }

    // Riprende subito quando si torna sull'app (es. si riaccende lo
    // schermo): a permesso già concesso non costa nulla e copre il caso
    // "l'ho lasciata aperta ma inattiva per un po'".
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && isGeoPermissionKnownGranted()) {
        doCheckin();
      }
    }

    // Dentro l'app nativa Android, il vero permesso di sistema va chiesto
    // esplicitamente tramite il plugin Capacitor prima di usare
    // navigator.geolocation — vedi nativeGeolocation.ts. Su web/PWA questa
    // chiamata non fa nulla.
    ensureNativeLocationPermission().finally(() => {
      if (cancelled) return;

      if (isGeoPermissionKnownGranted()) {
        doCheckin();
        startAutoRefresh();
        return;
      }

      const lastCheckinAt = Number(localStorage.getItem(CHECKIN_STORAGE_KEY) ?? 0);
      if (Date.now() - lastCheckinAt < CHECKIN_COOLDOWN_MS) return;
      doCheckin();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
