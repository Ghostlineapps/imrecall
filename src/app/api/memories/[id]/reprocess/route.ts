import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";

// Rielabora una memoria già esistente (nuovo embedding + classificazione),
// riusando la stessa pipeline di processMemory() usata alla creazione.
// Serve per applicare retroattivamente un fix alla pipeline di indicizzazione
// (es. l'inclusione del titolo nel testo embeddato, vedi classification.ts)
// alle memorie create prima del fix, senza dover ricaricare il file da capo.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: memory } = await supabase
    .from("memories")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!memory) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await supabase.from("memories").update({ status: "processing" }).eq("id", params.id);
  await processMemory(params.id);

  return NextResponse.json({ success: true });
}
