import { NextResponse } from "next/server";
import type { createClient, createServiceClient } from "@/lib/supabase/server";

type AnySupabaseClient = ReturnType<typeof createClient> | ReturnType<typeof createServiceClient>;

/**
 * Limite "a raffica" sulle route che chiamano OpenAI o Stripe — richiesta
 * utente 2026-11-22. Indipendente dai tetti mensili per piano (vedi
 * subscription/limits.ts): quelli contano l'uso nel mese e sono comunque
 * disattivati in questa fase di test (SUBSCRIPTION_LIMITS_ENABLED non
 * impostato); questo blocca chi manda troppe richieste in poco tempo — bug
 * nel client, script, o abuso deliberato — a prescindere dal piano o da
 * SUBSCRIPTION_LIMITS_ENABLED.
 *
 * Implementato con una funzione Postgres atomica (check_rate_limit, vedi
 * migrazione 040) invece che in memoria del processo Node: su Vercel ogni
 * invocazione serverless è un processo a sé, spesso più di una in parallelo
 * per lo stesso utente — un contatore in-process non vedrebbe le richieste
 * gestite da un'altra istanza e il limite non scatterebbe mai davvero.
 * Niente Upstash/Redis nel progetto: Supabase, già in uso ovunque, basta per
 * questi volumi (poche richieste al minuto per utente).
 */
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function checkRateLimit(
  supabase: AnySupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Se il controllo stesso fallisce (es. problema temporaneo lato
    // Supabase), non vogliamo rompere la funzionalità principale per un
    // meccanismo che dovrebbe solo proteggere da abusi: meglio lasciar
    // passare la richiesta e loggare, che restituire un falso errore
    // all'utente.
    console.error("checkRateLimit: check_rate_limit fallita, richiesta lasciata passare", error);
    return { allowed: true };
  }

  return data ? { allowed: true } : { allowed: false, retryAfterSeconds: windowSeconds };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "rate_limited", retry_after_seconds: retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

// Preset condivisi tra le route — numeri pensati come freno agli abusi, non
// come leva di prezzo (quella resta in subscription/limits.ts): abbondanti
// per un uso umano normale, bassi abbastanza da fermare un loop o uno script.
//
// "openaiProcess" è condiviso da tutte le route che creano o rielaborano una
// memoria (testo, foto, audio, documenti, riunioni, farmaci, Telegram): sono
// lo stesso tipo di costo (una pipeline processMemory per chiamata), quindi
// un unico bucket per utente invece di uno per endpoint — evita che un
// utente aggiri il limite passando da un tipo di upload all'altro.
export const RATE_LIMITS = {
  openaiChat: { limit: 15, windowSeconds: 60 },
  openaiSearch: { limit: 30, windowSeconds: 60 },
  openaiProcess: { limit: 20, windowSeconds: 60 },
  stripeCheckout: { limit: 5, windowSeconds: 60 },
} as const;
