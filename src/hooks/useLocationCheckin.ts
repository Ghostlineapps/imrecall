"use client";

import { useEffect } from "react";

// Ogni quanto ripetere il check-in di posizione. Non deve essere "ad ogni
// apertura": su iOS, un'app aggiunta alla Home è una nuova sessione della
// WebView ad ogni lancio, e sessionStorage — usato qui prima — si azzera
// insieme ad essa. Il risultato percepito dall'utente: il prompt di
// posizione ricompare ogni singola volta che apre l'app (segnalato
// 2026-08-21). Passando a localStorage con un timeout esplicito, il
// check-in avviene al massimo una volta ogni 6 ore, non ad ogni apertura.
// Non elimina un eventuale "dimentica il permesso" del sistema operativo
// tra un lancio e l'altro (limite noto delle PWA "Aggiungi a Home" su
// iOS, fuori dal nostro controllo), ma riduce drasticamente quante volte
// l'app stessa lo richiede.
const CHECKIN_COOLDOWN_MS = 1000 * 60 * 60 * 6;
const CHECKIN_STORAGE_KEY = "imrecall_checkin_at";

/**
 * Richiede la posizione all'apertura dell'app (al massimo una volta ogni
 * CHECKIN_COOLDOWN_MS, non ad ogni apertura) e la invia a /api/checkin per
 * generare eventuali candidati di resurfacing di prossimità.
 */
export function useLocationCheckin() {
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const lastCheckinAt = Number(localStorage.getItem(CHECKIN_STORAGE_KEY) ?? 0);
    if (Date.now() - lastCheckinAt < CHECKIN_COOLDOWN_MS) return;

    // Segna il tentativo subito, sia in caso di successo che di rifiuto:
    // altrimenti un utente che nega il permesso verrebbe ri-interpellato
    // alla prossima apertura invece che dopo il cooldown.
    const markAttempted = () => localStorage.setItem(CHECKIN_STORAGE_KEY, String(Date.now()));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        markAttempted();
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
      { maximumAge: 1000 * 60 * 30 }
    );
  }, []);
}
