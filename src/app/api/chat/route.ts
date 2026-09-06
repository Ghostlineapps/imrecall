import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embeddings";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
};

// Bug reale trovato il 2026-09-06: una domanda come "dove ho cenato il 5
// settembre" passava SOLO per match_memories, cioè similarità semantica tra
// l'embedding della domanda e quello delle memorie — nessun filtro per
// data. Se la memoria di quel giorno ha solo una descrizione generica
// (vedi il caso "Foto di una pizza" segnalato dall'utente), la similarità
// con "dove ho cenato" può restare sotto soglia e la domanda con una data
// esplicita fallisce anche quando la memoria giusta esiste. Qui, se la
// domanda contiene una data italiana riconoscibile, la affianchiamo con
// una ricerca diretta per memory_date — indipendente dall'embedding — più
// il percorso GPS grezzo di quel giorno (location_checkins), utile anche
// quando non esiste nessuna memoria salvata ma l'utente ha comunque
// attraversato quel posto.
function parseItalianDateMention(text: string): { start: Date; end: Date } | null {
  const match = text
    .toLowerCase()
    .match(
      /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?\b/
    );
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = ITALIAN_MONTHS[match[2]];
  if (day < 1 || day > 31) return null;

  const now = new Date();
  const year = match[3] ? parseInt(match[3], 10) : now.getUTCFullYear();

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
  return { start, end };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { query, session_id } = await req.json();

  // Enforcement limite: Free 5 query/giorno, Premium illimitato
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_tier === "free") {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", since.toISOString());

    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "daily_limit_reached" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Recupera o crea la sessione chat
  let sessionId = session_id;
  if (!sessionId) {
    const { data: session } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: query.slice(0, 60) })
      .select()
      .single();
    sessionId = session?.id;
  }

  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role: "user",
    content: query,
  });

  // Embed della query + ricerca semantica sulle memorie. Soglia abbassata
  // da 0.65 a 0.5: un test reale (query "scheda palestra di agosto" contro
  // una foto descritta come "lista di esercizi fisici per il mese di
  // agosto 2026") non superava 0.65 pur essendo chiaramente la memoria
  // giusta — 0.65 era troppo severo per query formulate diversamente dal
  // contenuto originale.
  const dateRange = parseItalianDateMention(query);

  const [{ data: semanticMatches }, dateMatches, dateCheckins] = await Promise.all([
    (async () => {
      const queryEmbedding = await generateEmbedding(query);
      return supabase.rpc("match_memories", {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 5,
        p_user_id: user.id,
      });
    })(),
    dateRange
      ? supabase
          .from("memories")
          .select("id, content, title, type, categories, tags, memory_date")
          .eq("user_id", user.id)
          .gte("memory_date", dateRange.start.toISOString())
          .lt("memory_date", dateRange.end.toISOString())
          .order("memory_date", { ascending: true })
          .then(({ data }: { data: any[] | null }) => data ?? [])
      : Promise.resolve([]),
    dateRange
      ? supabase
          .from("location_checkins")
          .select("place_name, created_at")
          .eq("user_id", user.id)
          .gte("created_at", dateRange.start.toISOString())
          .lt("created_at", dateRange.end.toISOString())
          .not("place_name", "is", null)
          .order("created_at", { ascending: true })
          .then(({ data }: { data: any[] | null }) => data ?? [])
      : Promise.resolve([]),
  ]);

  // Le memorie trovate per data esplicita vengono prima (più affidabili di
  // una similarità semantica su una data), poi quelle semantiche non già
  // incluse.
  const seenIds = new Set(dateMatches.map((m: any) => m.id));
  const matches = [
    ...dateMatches,
    ...(semanticMatches ?? []).filter((m: any) => !seenIds.has(m.id)),
  ];

  // Ultimi 6 messaggi per il contesto di follow-up
  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(6);

  const contextBlock = (matches ?? [])
    .map((m: any, i: number) => `[${i + 1}] (${m.memory_date}) ${m.title ?? ""} — ${m.content}`)
    .join("\n\n");

  // Percorso GPS grezzo del giorno menzionato (location_checkins): utile
  // come contesto "dove sei stato" anche quando quel giorno non è stata
  // salvata nessuna memoria vera e propria — es. una domanda su uno
  // spostamento senza foto/note collegate.
  const checkinsBlock = dateCheckins
    .map((c: any) => `- ${new Date(c.created_at).toLocaleTimeString("it-IT")}: ${c.place_name}`)
    .join("\n");

  const hasContext = matches.length > 0 || dateCheckins.length > 0;

  const systemPrompt = hasContext
    ? `Sei l'assistente di memoria personale di IMRECALL. Rispondi alla domanda dell'utente
usando SOLO le informazioni fornite come contesto qui sotto. Cita le memorie rilevanti
usando il loro numero tra parentesi quadre, es. [1]. Se la risposta viene solo dal
percorso GPS (nessuna memoria salvata quel giorno), dillo esplicitamente — è una
posizione registrata automaticamente, non un ricordo scritto dall'utente. Rispondi in
italiano, in modo diretto e naturale.

MEMORIE RILEVANTI:
${contextBlock || "(nessuna)"}
${checkinsBlock ? `\nPOSIZIONI REGISTRATE QUEL GIORNO:\n${checkinsBlock}` : ""}`
    : `Sei l'assistente di memoria personale di IMRECALL. Non è stata trovata nessuna
memoria rilevante per questa domanda. Dillo onestamente all'utente, senza inventare
nulla, in italiano.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...(history ?? []).reverse().slice(0, -1).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: query },
    ],
  });

  // Streaming di puro testo, scritto a mano invece di affidarsi a
  // OpenAIStream/StreamingTextResponse del pacchetto "ai": quel wrapper, a
  // seconda della versione installata, può serializzare col "data stream
  // protocol" (righe tipo 0:"token") invece del testo semplice che il
  // client si aspetta — è esattamente il bug riscontrato in test (la chat
  // mostrava all'utente 0:"Non" 0:" ho" ... invece della risposta). Qui
  // scriviamo solo i token grezzi nello stream, cosi' il client (che fa
  // decoder.decode(value) e concatena) riceve esattamente testo leggibile,
  // senza dipendere dal formato interno di una libreria terza.
  let fullResponse = "";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const token = chunk.choices[0]?.delta?.content ?? "";
          if (token) {
            fullResponse += token;
            controller.enqueue(encoder.encode(token));
          }
        }
      } finally {
        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          user_id: user.id,
          role: "assistant",
          content: fullResponse,
          cited_memory_ids: (matches ?? []).map((m: any) => m.id),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "X-Session-Id": sessionId, "Content-Type": "text/plain; charset=utf-8" },
  });
}
