import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";

// Niente chiamate a OpenAI qui: a differenza degli altri upload, nome e
// dose del farmaco li scrive l'utente stesso (dalla prescrizione del
// medico) — non c'è nulla da far leggere a GPT. La foto della confezione,
// se allegata, è solo un riferimento visivo salvato col ricordo.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const name = (formData.get("name") as string | null)?.trim();
  const dose = (formData.get("dose") as string | null)?.trim() || null;
  const timesRaw = formData.get("times") as string | null;
  const photo = formData.get("photo") as File | null;

  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  let times: string[] = [];
  try {
    times = JSON.parse(timesRaw || "[]");
  } catch {
    return NextResponse.json({ error: "invalid_times" }, { status: 400 });
  }
  times = Array.from(new Set(times)).filter((t) => TIME_RE.test(t)).sort();
  if (times.length === 0) {
    return NextResponse.json({ error: "at_least_one_time_required" }, { status: 400 });
  }

  let mediaPath: string | null = null;
  let mediaUrl: string | null = null;

  if (photo && photo.size > 0) {
    if (photo.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file_too_large", max_mb: MAX_FILE_BYTES / (1024 * 1024) }, { status: 413 });
    }
    const buffer = Buffer.from(await photo.arrayBuffer());
    mediaPath = `${user.id}/${crypto.randomUUID()}.jpg`;

    // Riusa il bucket "images" e le sue policy RLS esistenti — stessa idea
    // già applicata alle registrazioni "meeting" col bucket "audio" (vedi
    // migrazione 015): nessuna nuova policy di storage necessaria.
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(mediaPath, buffer, { contentType: photo.type || "image/jpeg" });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: signedUrl } = await supabase.storage.from("images").createSignedUrl(mediaPath, 60 * 60);
    mediaUrl = signedUrl?.signedUrl ?? null;
  }

  const content = `Farmaco: ${name}${dose ? ` — ${dose}` : ""}. Promemoria alle ${times.join(", ")}.`;

  const { data: memory, error: memoryError } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "medication",
      status: "processing",
      title: name,
      content,
      media_path: mediaPath,
      media_url: mediaUrl,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (memoryError) return NextResponse.json({ error: memoryError.message }, { status: 500 });

  const { data: medication, error: medError } = await supabase
    .from("medications")
    .insert({
      user_id: user.id,
      memory_id: memory.id,
      name,
      dose,
      times,
    })
    .select()
    .single();

  if (medError) return NextResponse.json({ error: medError.message }, { status: 500 });

  // Stessa pipeline asincrona (embedding, classificazione, NER) di tutte le
  // altre catture, così il farmaco resta cercabile come qualsiasi ricordo
  // ("che farmaco prendo alle 8?", "mi ricordi il Bivis?").
  processMemory(memory.id).catch((err) => console.error("processMemory failed (farmaco)", err));

  return NextResponse.json({ ...medication, memory }, { status: 201 });
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: medications, error } = await supabase
    .from("medications")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medications });
}
