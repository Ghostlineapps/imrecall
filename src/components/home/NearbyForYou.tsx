"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { MapPin, Compass } from "lucide-react";
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
    if (!("geolocation" in navigator)) {
      fallbackToLastKnown();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => fallbackToLastKnown(),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );

    async function fallbackToLastKnown() {
      try {
        const res = await fetch("/api/locations?limit=1");
        const json = await res.json();
        const last = json?.locations?.[0];
        if (last) setCoords({ lat: last.latitude, lon: last.longitude });
      } finally {
        setLocating(false);
      }
    }
  }, []);

  const { data, isLoading } = useSWR(
    coords ? `/api/places/nearby?lat=${coords.lat}&lon=${coords.lon}` : null,
    fetcher
  );

  if (locating || (coords && isLoading)) {
    return <div className="card h-24 animate-pulse bg-white/5" />;
  }

  if (!coords) return null;

  const recommendations = data?.recommendations ?? [];
  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-white/70 text-sm font-medium">
          <Compass size={16} />
          <span>Nei tuoi paraggi</span>
        </div>
        {!data?.hasPreferences && (
          <Link href="/settings/profile" className="text-xs text-primary-light">
            Personalizza
          </Link>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {recommendations.map((r: any) => (
          <div key={r.id} className="card min-w-[160px] space-y-1 shrink-0">
            <div className="flex items-center gap-1.5 text-primary-light text-xs">
              <MapPin size={12} />
              <span>{labelFor(r.category)}</span>
            </div>
            <p className="text-sm font-medium leading-snug">{r.name}</p>
            <p className="text-xs text-white/40">{r.distance_km} km</p>
          </div>
        ))}
      </div>
    </div>
  );
}
