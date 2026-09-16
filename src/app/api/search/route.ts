import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embeddings";
import { noStoreJson } from "@/lib/http/noStore";

// Risultati specifici dell'utente autenticato — non deve mai essere
// cacheabile da un CDN o dal browser: una cache per-URL (chiave "q")
// mostrerebbe altrimenti i ricordi di un utente a un altro che cerca lo
// stesso termine (vedi noStoreJson).
export const dynamic = "force-dynamic";

/**
 * Ricerca vera sui ricordi, con risultati cliccabili — non più solo una
 * risposta testuale sintetizzata da GPT come in /api/chat. Usa lo stesso
 * match_memories() (stessa soglia 0.5 tarata dopo il test reale sulla
 * scheda palestra), ma restituisce le memorie grezze così il client può
 * mostrarle come una lista (MemoryCard) che porta al dettaglio del
 * ricordo invece che a una frase.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return noStoreJson({ memories: [] });

  const queryEmbedding = await generateEmbedding(q);
  const { data: matches, error } = await supabase.rpc("match_memories", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 20,
    p_user_id: user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return noStoreJson({ memories: matches ?? [] });
}
