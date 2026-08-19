import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embeddings";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  const queryEmbedding = await generateEmbedding(query);
  const { data: matches } = await supabase.rpc("match_memories", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 5,
    p_user_id: user.id,
  });

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

  const systemPrompt = matches?.length
    ? `Sei l'assistente di memoria personale di IMRECALL. Rispondi alla domanda dell'utente
usando SOLO le memorie fornite come contesto qui sotto. Cita le memorie rilevanti
usando il loro numero tra parentesi quadre, es. [1]. Rispondi in italiano, in modo
diretto e naturale.

MEMORIE RILEVANTI:
${contextBlock}`
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
