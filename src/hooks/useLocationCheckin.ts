"use client";

import { useEffect } from "react";

/**
 * Richiede la posizione all'apertura dell'app (una volta per sessione,
 * non tracking continuo) e la invia a /api/checkin per generare eventuali
 * candidati di resurfacing di prossimità.
 */
export function useLocationCheckin() {
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const alreadyCheckedIn = sessionStorage.getItem("imrecall_checkin");
    if (alreadyCheckedIn) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch("/api/checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          });
          sessionStorage.setItem("imrecall_checkin", "1");
        } catch {
          // silenzioso: il check-in è un miglioramento opportunistico, non
          // deve mai bloccare l'esperienza dell'utente
        }
      },
      () => {
        // permesso negato: l'app funziona comunque, solo senza resurfacing
        // di prossimità
      },
      { maximumAge: 1000 * 60 * 30 }
    );
  }, []);
}
