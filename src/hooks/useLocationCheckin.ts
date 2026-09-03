"use client";

import { useEffect } from "react";
import { ensureNativeLocationPermission } from "@/lib/utils/nativeGeolocation";
import { isGeoPermissionKnownGranted, markGeoPermissionGranted } from "@/lib/utils/geoPermission";
import { haversineMeters } from "@/lib/utils/geoDistance";

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
// alcun prompt: niente più cooldown fisso. Usiamo watchPosition — il
// browser ci avvisa lui quando la posizione cambia — e ripetiamo il
// check-in solo quando ti sei spostato di almeno
// CHECKIN_MOVE_THRESHOLD_METERS dall'ultimo, o comunque non più tardi di
// CHECKIN_MAX_STALE_MS anche restando fermo (rete di sicurezza).
//
// Aggiunto 2026-09-03: prima, con l'app aperta e in mano, "sei di nuovo
// qui" restava fermo alla posizione del primo check-in della sessione
// (fino a 6 ore prima) finché non si toccava manualmente "posizione
// attuale" — su iOS in particolare, dove non c'è comunque modo di
// aggiornare la posizione ad app chiusa/schermo bloccato (limite di
// sistema, non risolvibile da una PWA). Una prima versione di questo fix
// usava un poll fisso ogni 5 minuti (richiamava /api/checkin — reverse
// geocoding + due RPC — anche restando fermi in un bar); sostituita lo
// stesso giorno con watchPosition più soglia di movimento, più efficiente
// e più reattivo di un poll a orologio.
const CHECKIN_COOLDOWN_MS = 1000 * 60 * 60 * 6; // pre-grant, invariato
const CHECKIN_MOVE_THRESHOLD_METERS = 100; // post-grant: check-in solo se ti sposti di almeno questo
const CHECKIN_MAX_STALE_MS = 1000 * 60 * 15; // ...o comunque non più tardi di così, anche da fermo
const CHECKIN_STORAGE_KEY = "imrecall_checkin_at";

/**
 * Richiede la posizione e la invia a /api/checkin per generare eventuali
 * candidati di resurfacing di prossimità. Prima del primo grant del
 * permesso, al massimo una volta ogni CHECKIN_COOLDOWN_MS; dopo, si ripete
 * da sola quando ti sposti abbastanza (o comunque ogni CHECKIN_MAX_STALE_MS)
 * mentre l'app resta aperta.
 */
export function useLocationCheckin() {
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    let watchId: number | null = null;
    let lastCheckinTriggeredAt = 0;
    let lastCheckinCoords: { lat: number; lon: number } | null = null;

    // Segna il tentativo subito, sia in caso di successo che di rifiuto:
    // altrimenti un utente che nega il permesso verrebbe ri-interpellato
    // alla prossima apertura invece che dopo il cooldown.
    const markAttempted = () => localStorage.setItem(CHECKIN_STORAGE_KEY, String(Date.now()));

    async function sendCheckin(latitude: number, longitude: number) {
      markAttempted();
      markGeoPermissionGranted();
      lastCheckinTriggeredAt = Date.now();
      lastCheckinCoords = { lat: latitude, lon: longitude };
      try {
        await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        });
      } catch {
        // silenzioso: il check-in è un miglioramento opportunistico, non
        // deve mai bloccare l'esperienza dell'utente
      }
    }

    // Vale la pena ripetere il check-in solo se ci si è spostati abbastanza
    // dall'ultimo, o se è passato troppo tempo anche restando fermi.
    function shouldTriggerCheckin(lat: number, lon: number) {
      if (!lastCheckinCoords) return true;
      if (Date.now() - lastCheckinTriggeredAt > CHECKIN_MAX_STALE_MS) return true;
      return (
        haversineMeters(lastCheckinCoords.lat, lastCheckinCoords.lon, lat, lon) >=
        CHECKIN_MOVE_THRESHOLD_METERS
      );
    }

    function startWatching() {
      if (watchId !== null || cancelled) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude } = pos.coords;
          if (!shouldTriggerCheckin(latitude, longitude)) return;
          sendCheckin(latitude, longitude);
        },
        () => {
          // GPS temporaneamente non disponibile (es. galleria, tunnel): non
          // è un rifiuto di permesso, non tocchiamo il cooldown pre-grant.
        },
        { enableHighAccuracy: true, maximumAge: 2 * 60 * 1000, timeout: 10000 }
      );
    }

    function doInitialCheckin() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          sendCheckin(pos.coords.latitude, pos.coords.longitude);
          startWatching();
        },
        () => {
          // permesso negato: l'app funziona comunque, solo senza resurfacing
          // di prossimità. Segniamo comunque il tentativo per rispettare il
          // cooldown pre-grant ed evitare di richiederlo di nuovo alla
          // prossima apertura.
          markAttempted();
        },
        { maximumAge: 1000 * 60 * 2 }
      );
    }

    // Riprende subito quando si torna sull'app (es. si riaccende lo
    // schermo): su iOS watchPosition può restare "in pausa" per un po'
    // mentre l'app non è in foreground, quindi al ritorno forziamo una
    // lettura immediata invece di aspettare il prossimo evento del watch.
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !isGeoPermissionKnownGranted()) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          if (shouldTriggerCheckin(pos.coords.latitude, pos.coords.longitude)) {
            sendCheckin(pos.coords.latitude, pos.coords.longitude);
          }
        },
        () => {
          // silenzioso: il watch resta comunque attivo
        },
        { maximumAge: 2 * 60 * 1000 }
      );
    }

    // Dentro l'app nativa Android, il vero permesso di sistema va chiesto
    // esplicitamente tramite il plugin Capacitor prima di usare
    // navigator.geolocation — vedi nativeGeolocation.ts. Su web/PWA questa
    // chiamata non fa nulla.
    ensureNativeLocationPermission().finally(() => {
      if (cancelled) return;

      if (isGeoPermissionKnownGranted()) {
        doInitialCheckin();
        return;
      }

      const lastCheckinAt = Number(localStorage.getItem(CHECKIN_STORAGE_KEY) ?? 0);
      if (Date.now() - lastCheckinAt < CHECKIN_COOLDOWN_MS) return;
      doInitialCheckin();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
