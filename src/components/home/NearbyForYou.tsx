"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { MapPin, Compass, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ensureNativeLocationPermission } from "@/lib/utils/nativeGeolocation";
import { isGeoPermissionKnownGranted, markGeoPermissionGranted } from "@/lib/utils/geoPermission";
import { haversineMeters } from "@/lib/utils/geoDistance";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: "Ristorante",
  fast_food: "Fast food",
  cafe: "Caffè",
  bar: "Bar",
  nightclub: "Locale notturno",
  pub: "Pub",
  museum: "Museo",
  gallery: "Galleria",
  artwork: "Opera d'arte",
  park: "Parco",
  beach: "Spiaggia",
  wood: "Bosco",
};

function labelFor(category: string) {
  return CATEGORY_LABELS[category] ?? (category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " "));
}

// Non richiedere la posizione al browser più di una volta ogni ora quando il
// permesso non è ancora stato concesso in modo definitivo (o è stato
// negato): senza questo cooldown, ogni singola apertura della Home faceva
// ripartire il prompt di geolocalizzazione, anche più volte al giorno —
// stesso sintomo già risolto per il check-in in background in
// useLocationCheckin.ts, qui applicato allo stesso componente che però,
// a differenza del check-in, deve comunque mostrare qualcosa: nel
// frattempo ripieghiamo sull'ultimo punto noto da /api/locations.
//
// Se il permesso è già "granted" in modo definitivo, invece, richiedere la
// posizione non mostra alcun prompt: niente più cooldown, la richiediamo
// subito E la teniamo aggiornata con watchPosition (vedi startWatching
// sotto) finché l'app resta aperta.
//
// Aggiunto 2026-09-03: prima, restando con l'app aperta senza mai
// toccarla, "nei paraggi" restava fermo alla posizione del primo avvio
// finché non si faceva tap manualmente sulla posizione attuale — su iOS
// in particolare, perché navigator.permissions.query per la
// geolocalizzazione non è affidabile in Safari e quindi si ricadeva quasi
// sempre sul solo cooldown. Una prima versione di questo fix usava un
// poll fisso ogni 5 minuti; sostituito lo stesso giorno con watchPosition
// più GEO_MOVE_THRESHOLD_METERS: il browser avvisa lui quando la
// posizione cambia davvero, invece di ricontrollare a orologio anche da
// fermi, e con enableHighAccuracy true evitiamo falsi movimenti dovuti al
// rumore del GPS. GEO_MAX_STALE_MS resta come rete di sicurezza: se per
// qualche motivo watchPosition non scatena mai un evento "abbastanza
// diverso" (es. ci si muove sempre sotto soglia), aggiorniamo comunque
// almeno ogni quarto d'ora.
const GEO_COOLDOWN_MS = 1000 * 60 * 60; // 1 ora, solo prima del primo grant
const GEO_MOVE_THRESHOLD_METERS = 100; // dopo il grant: aggiorna solo se ti sposti di almeno questo
const GEO_MAX_STALE_MS = 1000 * 60 * 15; // ...o comunque non più tardi di così, anche da fermo
const GEO_STORAGE_KEY = "imrecall_nearby_geo_at";

/**
 * "Nei tuoi paraggi": la risposta concreta a "cosa fa per semplificare la
 * vita" — arrivando in un posto nuovo, l'app propone subito i luoghi
 * coerenti col profilo (dieta/interessi) invece di lasciare che l'utente
 * cerchi da solo. La posizione viene chiesta al browser; se negata o non
 * disponibile, ripieghiamo sull'ultimo punto noto da /api/locations.
 */
export function NearbyForYou() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;
    let lastTriggeredAt = 0;
    let lastTriggeredCoords: { lat: number; lon: number } | null = null;

    async function fallbackToLastKnown() {
      try {
        const res = await fetch("/api/locations?limit=1");
        const json = await res.json();
        const last = json?.locations?.[0];
        if (!cancelled && last) setCoords({ lat: last.latitude, lon: last.longitude });
      } finally {
        if (!cancelled) setLocating(false);
      }
    }

    function applyPosition(lat: number, lon: number) {
      lastTriggeredAt = Date.now();
      lastTriggeredCoords = { lat, lon };
      localStorage.setItem(GEO_STORAGE_KEY, String(Date.now()));
      markGeoPermissionGranted();
      if (cancelled) return;
      setCoords({ lat, lon });
      setLocating(false);
    }

    // Vale la pena aggiornare solo se ci si è spostati abbastanza, o se è
    // passato troppo tempo dall'ultimo aggiornamento (rete di sicurezza
    // anche restando fermi).
    function shouldTrigger(lat: number, lon: number) {
      if (!lastTriggeredCoords) return true;
      if (Date.now() - lastTriggeredAt > GEO_MAX_STALE_MS) return true;
      return haversineMeters(lastTriggeredCoords.lat, lastTriggeredCoords.lon, lat, lon) >= GEO_MOVE_THRESHOLD_METERS;
    }

    // Una volta ottenuta una posizione con successo, il permesso è concesso
    // in modo definitivo: da qui in poi il browser stesso ci avvisa quando
    // la posizione cambia, senza bisogno che l'utente tocchi nulla né che
    // ricontrolliamo a orologio.
    function startWatching() {
      if (watchId !== null || cancelled) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude } = pos.coords;
          if (!shouldTrigger(latitude, longitude)) return;
          applyPosition(latitude, longitude);
        },
        () => {
          // GPS temporaneamente non disponibile (es. galleria, tunnel): non
          // è un rifiuto di permesso, teniamo semplicemente l'ultima
          // posizione buona finché non arriva un fix nuovo.
        },
        { enableHighAccuracy: true, maximumAge: 2 * 60 * 1000, timeout: 10000 }
      );
    }

    function requestPosition() {
      const markAttempted = () => localStorage.setItem(GEO_STORAGE_KEY, String(Date.now()));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          markAttempted();
          if (cancelled) return;
          applyPosition(pos.coords.latitude, pos.coords.longitude);
          startWatching();
        },
        () => {
          markAttempted();
          fallbackToLastKnown();
        },
        { timeout: 8000, maximumAge: 2 * 60 * 1000 }
      );
    }

    function requestPositionRespectingCooldown() {
      const lastAttemptAt = Number(localStorage.getItem(GEO_STORAGE_KEY) ?? 0);
      if (Date.now() - lastAttemptAt < GEO_COOLDOWN_MS) {
        fallbackToLastKnown();
        return;
      }
      requestPosition();
    }

    // Riprende subito quando si torna sull'app (es. si riaccende lo
    // schermo, o si torna dalla tab del browser): su iOS watchPosition può
    // restare "in pausa" per un po' mentre l'app non è in foreground, quindi
    // al ritorno forziamo una lettura immediata invece di aspettare il
    // prossimo evento del watch.
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !isGeoPermissionKnownGranted()) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          if (shouldTrigger(pos.coords.latitude, pos.coords.longitude)) {
            applyPosition(pos.coords.latitude, pos.coords.longitude);
          }
        },
        () => {
          // silenzioso: il watch resta comunque attivo
        },
        { maximumAge: 2 * 60 * 1000 }
      );
    }

    if (!("geolocation" in navigator)) {
      fallbackToLastKnown();
      return () => {
        cancelled = true;
      };
    }

    // Dentro l'app nativa Android il vero permesso di sistema va chiesto
    // esplicitamente tramite il plugin Capacitor — vedi nativeGeolocation.ts
    // e la stessa nota in useLocationCheckin.ts. Su web/PWA non fa nulla.
    ensureNativeLocationPermission().finally(() => {
      if (cancelled) return;

      if (isGeoPermissionKnownGranted()) {
        // Già sappiamo che il permesso è concesso (grant ottenuto in
        // questa sessione o in una precedente): nessun bisogno di passare
        // dalla Permissions API, che su Safari/iOS è comunque inaffidabile.
        requestPosition();
        return;
      }

      if ("permissions" in navigator) {
        navigator.permissions
          .query({ name: "geolocation" })
          .then((status) => {
            if (cancelled) return;
            // Permesso già concesso in modo definitivo: nessun prompt in
            // arrivo, possiamo chiedere la posizione fresca ogni volta.
            if (status.state === "granted") {
              requestPosition();
            } else {
              requestPositionRespectingCooldown();
            }
          })
          .catch(() => {
            if (!cancelled) requestPositionRespectingCooldown();
          });
      } else {
        // Browser senza Permissions API (es. Safari meno recente): meglio
        // rispettare comunque il cooldown per non rischiare di ri-chiedere
        // il permesso ad ogni apertura.
        requestPositionRespectingCooldown();
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const { data, isLoading } = useSWR(
    coords ? `/api/places/nearby?lat=${coords.lat}&lon=${coords.lon}` : null,
    fetcher
  );

  if (locating || (coords && isLoading)) {
    return <div className="card-light h-24 animate-pulse bg-celeste-navy/5" />;
  }

  if (!coords) return null;

  const recommendations = data?.recommendations ?? [];
  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-celeste-muted text-sm font-medium">
          <Compass size={16} />
          <span>Nei tuoi paraggi</span>
        </div>
        {!data?.hasPreferences && (
          <Link href="/settings/profile" className="text-xs text-celeste-accentDark">
            Personalizza
          </Link>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {recommendations.map((r: any) => {
          // Cliccabile solo se il locale ha un sito mappato su OSM
          // (richiesta esplicita: "ovviamente se hanno un sito") — senza
          // sito resta una card informativa, non un link vuoto/rotto.
          const Tag: "a" | "div" = r.website ? "a" : "div";
          const linkProps = r.website
            ? { href: r.website, target: "_blank", rel: "noopener noreferrer" }
            : {};
          return (
            <Tag
              key={r.id}
              {...linkProps}
              className="card-light min-w-[160px] space-y-1 shrink-0 block active:opacity-80"
            >
              <div className="flex items-center justify-between gap-2 text-celeste-accentDark text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin size={12} className="shrink-0" />
                  <span className="truncate">{labelFor(r.category)}</span>
                </span>
                {r.website && <ExternalLink size={12} className="shrink-0" />}
              </div>
              <p className="text-sm font-medium leading-snug text-celeste-navy">{r.name}</p>
              <p className="text-xs text-celeste-muted">{r.distance_km} km</p>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
