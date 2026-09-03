"use client";

// Una volta ottenuta con successo la posizione dal browser, salviamo questo
// flag: da quel momento sappiamo che il permesso di geolocalizzazione è
// "granted" in modo definitivo, quindi richiederla di nuovo non mostra mai
// un prompt e possiamo farlo liberamente (niente più bisogno del cooldown
// "difensivo" usato prima del primo grant — vedi NearbyForYou.tsx e
// useLocationCheckin.ts). Condiviso tra i due così il grant ottenuto da
// uno vale subito anche per l'altro, invece di doverlo riscoprire due
// volte. Aggiunto 2026-09-03 per risolvere il ritardo di aggiornamento
// posizione su iOS (segnalato: "non aggiorna la posizione sino a quando
// non fai il tap sulla posizione attuale").
const GEO_GRANTED_KEY = "imrecall_geo_granted";

export function isGeoPermissionKnownGranted(): boolean {
  try {
    return localStorage.getItem(GEO_GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGeoPermissionGranted() {
  try {
    localStorage.setItem(GEO_GRANTED_KEY, "1");
  } catch {
    // localStorage non disponibile (es. modalità privata): non bloccante,
    // semplicemente non ricorderemo il grant tra una sessione e l'altra.
  }
}
