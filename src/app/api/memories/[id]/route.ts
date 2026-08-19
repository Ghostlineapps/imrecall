import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Bucket Storage per tipo di memoria — serve per rigenerare un signed URL
// fresco ad ogni apertura del dettaglio (vedi sotto).
const BUCKET_BY_TYPE: Record<string, string> = {
  image: "images",
  audio: "audio",
  meeting: "audio",
  document: "documents",
  medication: "images", // foto opzionale della confezione, caricata su "images" — vedi /api/medications
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: memory, error } = await supabase
    .from("memories")
    .select("*, memory_entities(entities(*)), memory_places(places(*))")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !memory) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Il media_url salvato in DB al momento dell'upload è un signed URL con
  // scadenza di 1 ora (vedi le route /api/upload/*) — riaprendo il
  // ricordo più tardi quel link è scaduto ("InvalidJWT: exp claim
  // timestamp check failed"). Qui ne generiamo uno fresco ad ogni
  // richiesta, valido un'altra ora, invece di riusare quello salvato.
  let mediaUrl = memory.media_url;
  const bucket = BUCKET_BY_TYPE[memory.type];
  if (memory.media_path && bucket) {
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(memory.media_path, 60 * 60);
    if (signed?.signedUrl) mediaUrl = signed.signedUrl;
  }

  // Memorie correlate per similarità embedding
  let related: any[] = [];
  if (memory.embedding) {
    const { data } = await supabase.rpc("match_memories", {
      query_embedding: memory.embedding,
      match_threshold: 0.75,
      match_count: 3,
      p_user_id: user.id,
    });
    related = (data ?? []).filter((m: any) => m.id !== memory.id);
  }

  return NextResponse.json({ ...memory, media_url: mediaUrl, related });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["title", "content", "memory_date", "categories", "tags", "intention_status"];
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from("memories")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Soft delete — passa da una funzione SECURITY DEFINER (soft_delete_memory,
  // vedi migrazione 018) invece di un UPDATE diretto sulla tabella. Un UPDATE
  // diretto qui violava sempre la RLS: la policy SELECT che nasconde i
  // ricordi con deleted_at non null viene applicata da Postgres anche alla
  // riga risultante dell'UPDATE (oltre alla WITH CHECK della policy UPDATE
  // stessa), quindi il soft-delete (deleted_at: null -> now()) falliva
  // sempre con "new row violates row-level security policy", per qualsiasi
  // utente. La funzione bypassa RLS e ricontrolla la proprietà internamente.
  const { error } = await supabase.rpc("soft_delete_memory", { p_id: params.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
