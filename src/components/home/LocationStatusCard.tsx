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
    return <div className="card-light h-16 animate-pulse bg-celeste-navy/5" />;
  }

  const last = data?.locations?.[0];

  return (
    <Link href="/settings/location" className="card-light flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-celeste-accent/10 flex items-center justify-center text-celeste-accentDark shrink-0">
        <MapPinned size={18} />
      </div>
      <div className="min-w-0 flex-1">
        {/* Etichetta fissa: prima, con una posizione già registrata, la
            card mostrava solo l'indirizzo (es. "Via Roma 12") senza dire
            da nessuna parte che si tratta di "Spostamenti" — chi non se lo
            ricordava a memoria non capiva a cosa servisse la card.
            Segnalato dall'utente. */}
        <p className="text-xs font-medium text-celeste-accentDark">Spostamenti</p>
        {last ? (
          <>
            <p className="text-sm font-medium truncate text-celeste-navy">{last.place_name ?? "Posizione registrata"}</p>
            <p className="text-xs text-celeste-muted">
              {formatDistanceToNow(new Date(last.recorded_at), { addSuffix: true, locale: it })}
            </p>
          </>
        ) : (
          <p className="text-xs text-celeste-muted">Importa la cronologia per attivare i ricordi di prossimità</p>
        )}
      </div>
      <ChevronRight size={18} className="text-celeste-navy/25 shrink-0" />
    </Link>
  );
}
