"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { MapPin, Compass, ExternalLink } from "lucide-react";
import Link from "next/link";

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
// Se il permesso è già "granted" in modo definitivo, invece, richiedere la
// posizione non mostra alcun prompt e possiamo farlo ad ogni apertura senza
// penalizzare la freschezza dei suggerimenti.
const GEO_COOLDOWN_MS = 1000 * 60 * 60; // 1 ora
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

    function requestPosition() {
      const markAttempted = () => localStorage.setItem(GEO_STORAGE_KEY, String(Date.now()));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          markAttempted();
          if (cancelled) return;
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          setLocating(false);
        },
        () => {
          markAttempted();
          fallbackToLastKnown();
        },
        { timeout: 8000, maximumAge: 5 * 60 * 1000 }
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

    if (!("geolocation" in navigator)) {
      fallbackToLastKnown();
      return () => {
        cancelled = true;
      };
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

    return () => {
      cancelled = true;
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
