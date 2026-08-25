import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import { FREE_MEMORIES_PER_MONTH, isMemoryQuotaExceeded } from "@/lib/subscription/limits";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, content, link_url, title, description, image } = body;

  // Enforcement limite tier Free: 100 memorie/mese, contate dal vivo su
  // tutte le memorie dell'utente (vedi src/lib/subscription/limits.ts).
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (await isMemoryQuotaExceeded(supabase, user.id, profile?.subscription_tier)) {
    return NextResponse.json({ error: "limit_reached", limit: FREE_MEMORIES_PER_MONTH }, { status: 402 });
  }

  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type,
      status: "processing",
      content: type === "text" ? content : null,
      raw_content: content,
      link_url,
      link_title: title,
      link_description: description,
      link_image_url: image,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Risposta istantanea: la classificazione AI (embedding, categoria, tag,
  // NER, rilevamento intenzione/luogo) avviene in background e non blocca
  // l'utente. In produzione: usare waitUntil() su Vercel Pro+, con fallback
  // alla Supabase Edge Function process-memory per il piano Hobby.
  processMemory(memory.id).catch((err) => console.error("processMemory failed", err));

  return NextResponse.json(memory, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 20);
  const cursor = searchParams.get("cursor");
  const type = searchParams.get("type");
  const category = searchParams.get("category");
  const isHealth = searchParams.get("is_health");

  let query = supabase
    .from("memories")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("memory_date", { ascending: false })
    .limit(limit);

  if (cursor) query = query.lt("memory_date", cursor);
  if (type) query = query.eq("type", type);
  if (category) query = query.contains("categories", [category]);
  // Usato dalla sezione Salute (vedi migrazione 020) per mostrare solo i
  // referti/esami caricati da lì e i farmaci, senza introdurre una
  // categorizzazione visibile altrove.
  if (isHealth === "true") query = query.eq("is_health", true);

  const { data: memories, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ memories });
}
