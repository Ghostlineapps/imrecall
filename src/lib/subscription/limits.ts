import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createClient>;

// Limiti di piano (free vs a pagamento) — vedi BACKLOG.md per il
// ragionamento e i costi reali (Whisper/gpt-4o-mini/gpt-4o, controllati il
// 25/08/2026) dietro questi numeri.
//
// Calcolati "dal vivo" con query filtrate sul mese corrente, non con
// contatori salvati sul profilo: `memory_count_this_month` (vedi
// migrazione 002_core_tables.sql) non veniva incrementato da nessun
// codice né trigger, quindi restava sempre a 0 e il limite "100 memorie/
// mese" non scattava mai. Un contatore salvato richiederebbe anche un cron
// di reset mensile (non esiste) — una query dal vivo, filtrata per data,
// evita il problema alla radice, riusando lo stesso pattern già in
// produzione per il limite chat giornaliero (vedi /api/chat/route.ts).
export const FREE_MEMORIES_PER_MONTH = 100;
export const FREE_TRANSCRIPTION_MINUTES_PER_MONTH = 60;
export const PREMIUM_TRANSCRIPTION_MINUTES_PER_MONTH = 600;

export function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Conta TUTTE le memorie create dall'utente nel mese corrente, di
// qualunque tipo (testo, link, audio, foto, documento, riunione). Prima di
// questo fix ogni endpoint di upload aveva la propria logica indipendente
// (o nessuna): solo /api/memories controllava un limite, e solo per
// testo/link — audio, foto, documenti e riunioni lo bypassavano del tutto.
export async function memoriesUsedThisMonth(supabase: SupabaseServerClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfCurrentMonthIso());

  return count ?? 0;
}

export async function isMemoryQuotaExceeded(
  supabase: SupabaseServerClient,
  userId: string,
  tier: string | null | undefined
): Promise<boolean> {
  if (tier !== "free") return false;
  const used = await memoriesUsedThisMonth(supabase, userId);
  return used >= FREE_MEMORIES_PER_MONTH;
}

export function transcriptionMinutesQuota(tier: string | null | undefined): number {
  return tier === "free" ? FREE_TRANSCRIPTION_MINUTES_PER_MONTH : PREMIUM_TRANSCRIPTION_MINUTES_PER_MONTH;
}

// Minuti di trascrizione (audio + riunioni sommati) già usati nel mese
// corrente — somma `media_duration` (secondi) delle memorie type audio/
// meeting create da inizio mese. Questo, non il tetto per singola
// registrazione (MAX_SECONDS_* nelle rispettive route), è la vera leva di
// differenziazione free/premium: un utente può fare tante registrazioni
// brevi o poche lunghe, quello che conta ai fini del costo (Whisper fattura
// a minuto) è il totale mensile.
export async function transcriptionMinutesUsedThisMonth(
  supabase: SupabaseServerClient,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from("memories")
    .select("media_duration")
    .eq("user_id", userId)
    .in("type", ["audio", "meeting"])
    .gte("created_at", startOfCurrentMonthIso());

  const totalSeconds = (data ?? []).reduce((sum, row) => sum + (row.media_duration ?? 0), 0);
  return totalSeconds / 60;
}
