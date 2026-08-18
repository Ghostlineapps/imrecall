"use client";

import useSWR from "swr";
import Link from "next/link";
import { MapPinned, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Prima "Spostamenti" viveva solo dentro Impostazioni, tre tocchi di
 * distanza da dove il suo valore si vede davvero (i consigli nei paraggi e
 * il "sei tornato qui" qui in Home). Questa card la rende visibile dove
 * conta, senza duplicare la pagina di gestione completa in
 * /settings/location — resta un semplice punto d'ingresso.
 */
export function LocationStatusCard() {
  const { data, isLoading } = useSWR("/api/locations?limit=1", fetcher);

  if (isLoading) {
    return <div className="card h-16 animate-pulse bg-white/5" />;
  }

  const last = data?.locations?.[0];

  return (
    <Link href="/settings/location" className="card flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-primary-light shrink-0">
        <MapPinned size={18} />
      </div>
      <div className="min-w-0 flex-1">
        {last ? (
          <>
            <p className="text-sm font-medium truncate">{last.place_name ?? "Posizione registrata"}</p>
            <p className="text-xs text-white/40">
              {formatDistanceToNow(new Date(last.recorded_at), { addSuffix: true, locale: it })}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Spostamenti</p>
            <p className="text-xs text-white/40">Importa la cronologia per attivare i ricordi di prossimità</p>
          </>
        )}
      </div>
      <ChevronRight size={18} className="text-white/20 shrink-0" />
    </Link>
  );
}
