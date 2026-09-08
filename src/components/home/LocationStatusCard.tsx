"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { MapPinned, ChevronRight, RefreshCw } from "lucide-react";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { it } from "date-fns/locale";
import { ensureNativeLocationPermission } from "@/lib/utils/nativeGeolocation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Sopra questa soglia, il "X minuti fa" passa dal grigio normale a un
// colore di avviso: senza questo segnale visivo l'utente non ha modo di
// distinguere a colpo d'occhio "posizione aggiornata poco fa" da "posizione
// vecchia di 23 minuti da un altro paese" (bug reale segnalato dall'utente
// il 2026-09-07: guidando da Mariotto a Giovinazzo passando per Terlizzi,
// questa card mostrava ancora l'ultima posizione di 23 minuti prima senza
// che nulla lo segnalasse chiaramente). 15 minuti: più del normale
// intervallo di tracciamento (10 min), quindi non scatta per un semplice
// giro di ping, ma abbastanza basso da avvisare presto se il fallback
// web/iOS non ha ancora recuperato.
const STALE_WARNING_MINUTES = 15;

/**
 * Prima "Spostamenti" viveva solo dentro Impostazioni, tre tocchi di
 * distanza da dove il suo valore si vede davvero (i consigli nei paraggi e
 * il "sei tornato qui" qui in Home). Questa card la rende visibile dove
 * conta, senza duplicare la pagina di gestione completa in
 * /settings/location — resta un semplice punto d'ingresso.
 */
// Poll invece del solo fetch-on-mount di default di SWR: questa card resta
// spesso aperta a lungo con l'app in primo piano (es. mentre si guida), e
// senza un refresh periodico "Spostamenti" mostra il luogo e il "X minuti
// fa" congelati al primo caricamento — SWR normalmente riesegue il fetch
// solo al mount, al focus della finestra o alla riconnessione di rete,
// nessuno dei quali scatta se l'app resta semplicemente aperta e visibile.
// Segnalato 2026-09-04: card ferma su "6 minuti fa" per oltre mezz'ora con
// l'utente fermo nello stesso posto e l'app sempre in primo piano — non un
// problema di tracciamento (che nel frattempo continuava a registrare
// posizioni aggiornate), solo di questa card che non si aggiornava mai da
// sola. 45s: abbastanza reattivo da sembrare "live", abbastanza rado da non
// pesare — è solo una lettura, non un'operazione costosa.
const LOCATION_CARD_REFRESH_MS = 45 * 1000;

export function LocationStatusCard() {
  const { data, isLoading, mutate } = useSWR("/api/locations?limit=1", fetcher, {
    refreshInterval: LOCATION_CARD_REFRESH_MS,
  });

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  if (isLoading) {
    return <div className="card-light h-16 animate-pulse bg-celeste-navy/5" />;
  }

  const last = data?.locations?.[0];
  const staleMinutes = last ? differenceInMinutes(new Date(), new Date(last.recorded_at)) : 0;
  const isStale = staleMinutes >= STALE_WARNING_MINUTES;

  // Tocco manuale "aggiorna ora": non aspetta il prossimo tick dell'hook
  // app-wide (useLocationFallbackTracking.ts) né il prossimo remount di
  // questa card — chiede subito una posizione fresca al browser (maximumAge
  // 0, a differenza degli altri ping che riusano un fix recente) e aggiorna
  // la card sul posto tramite mutate(), senza dover navigare fino a
  // Impostazioni → Spostamenti solo per forzare un aggiornamento.
  async function handleRefresh(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!navigator.geolocation || refreshing) return;

    setRefreshing(true);
    setRefreshError(false);
    try {
      await ensureNativeLocationPermission();
      await new Promise<void>((resolve, reject) => {
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
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          (err) => reject(err),
          { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 }
        );
      });
      await mutate();
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="card-light flex items-center gap-3">
      <Link href="/settings/location" className="flex items-center gap-3 flex-1 min-w-0">
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
              <p className={`text-xs ${isStale ? "text-urgent font-medium" : "text-celeste-muted"}`}>
                {formatDistanceToNow(new Date(last.recorded_at), { addSuffix: true, locale: it })}
              </p>
            </>
          ) : (
            <p className="text-xs text-celeste-muted">Importa la cronologia per attivare i ricordi di prossimità</p>
          )}
        </div>
      </Link>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label={refreshError ? "Impossibile aggiornare la posizione, riprova" : "Aggiorna posizione ora"}
        title={refreshError ? "Impossibile aggiornare la posizione. Riprova." : "Aggiorna posizione ora"}
        className={`w-8 h-8 rounded-full flex items-center justify-center active:bg-celeste-navy/5 shrink-0 ${
          refreshError ? "text-urgent" : "text-celeste-navy/50"
        }`}
      >
        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
      </button>

      <Link href="/settings/location">
        <ChevronRight size={18} className="text-celeste-navy/25 shrink-0" />
      </Link>
    </div>
  );
}
