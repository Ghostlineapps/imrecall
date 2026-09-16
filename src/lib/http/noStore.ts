import { NextResponse } from "next/server";

// Le route API che leggono dati personali (farmaci, ciclo, gravidanza,
// abbonamento, ecc.) devono dichiarare esplicitamente di non essere
// cache-abili: senza questo, Next.js/Vercel possono etichettare la
// risposta come "public, max-age=0, must-revalidate" invece di
// "private, no-store" — osservato in produzione su /api/user/usage,
// causa dello sfarfallio Free/Premium visto in Impostazioni il 2026-09-16.
// Usare al posto di NextResponse.json in ogni GET che legge dati
// specifici dell'utente autenticato.
export function noStoreJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}
