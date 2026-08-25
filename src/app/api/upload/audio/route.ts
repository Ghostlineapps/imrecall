import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import {
  FREE_MEMORIES_PER_MONTH,
  isMemoryQuotaExceeded,
  transcriptionMinutesQuota,
  transcriptionMinutesUsedThisMonth,
} from "@/lib/subscription/limits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Limite durata per tier: 30 min Free, 100 min Premium.
// Nota: la premium era stata richiesta a 300 min, ma non è raggiungibile con
// l'approccio attuale a singola chiamata Whisper — vedi MAX_FILE_BYTES sotto.
const MAX_SECONDS_FREE = 1800; // 30 min
const MAX_SECONDS_PREMIUM = 6000; // 100 min

// Whisper accetta al massimo 25MB per file (stesso limite gestito in
// /api/upload/meeting/route.ts). AudioRecorder.tsx forza lo stesso bitrate
// basso già usato per le riunioni (32kbps, ok per il parlato) per restare
// sotto soglia anche a 100 min (~24MB attesi, margine stretto ma voluto per
// non sprecare durata utile) — a 300 min anche a 32kbps si sfonderebbe
// abbondantemente il limite (~72MB), da qui il tetto più basso del
// richiesto. Per arrivare davvero a 300 min servirebbe dividere la
// registrazione in più segmenti trascritti separatamente (lavoro più
// corposo, non ancora fatto).
const MAX_FILE_BYTES = 24 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const duration = Number(formData.get("duration") ?? 0);

  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();
  const tier = profile?.subscription_tier;

  // Enforcement limite tier Free: 100 memorie/mese, condiviso tra tutti i
  // tipi — vedi src/lib/subscription/limits.ts.
  if (await isMemoryQuotaExceeded(supabase, user.id, tier)) {
    return NextResponse.json({ error: "limit_reached", limit: FREE_MEMORIES_PER_MONTH }, { status: 402 });
  }

  // Tetto per singola registrazione: limite tecnico legato a Whisper (vedi
  // MAX_FILE_BYTES sotto), non la leva di differenziazione free/premium.
  const maxSeconds = tier === "free" ? MAX_SECONDS_FREE : MAX_SECONDS_PREMIUM;
  if (duration > maxSeconds) {
    return NextResponse.json({ error: "duration_exceeded", max: maxSeconds }, { status: 402 });
  }

  // Monte ore mensile (audio + riunioni sommati): questa sì è la vera leva
  // di differenziazione free/premium, ancorata al costo reale di Whisper
  // ($0,006/min) — vedi src/lib/subscription/limits.ts e BACKLOG.md.
  const minutesUsed = await transcriptionMinutesUsedThisMonth(supabase, user.id);
  const minutesQuota = transcriptionMinutesQuota(tier);
  if (minutesUsed + duration / 60 > minutesQuota) {
    return NextResponse.json(
      { error: "monthly_minutes_exceeded", max_minutes: minutesQuota, used_minutes: Math.round(minutesUsed) },
      { status: 402 }
    );
  }

  const path = `${user.id}/${crypto.randomUUID()}.webm`;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", max_mb: MAX_FILE_BYTES / (1024 * 1024) },
      { status: 413 }
    );
  }

  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(path, buffer, { contentType: "audio/webm" });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Trascrizione via Whisper
  const transcription = await openai.audio.transcriptions.create({
    file: new File([buffer], "recording.webm", { type: "audio/webm" }),
    model: "whisper-1",
    language: "it",
  });

  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "audio",
      status: "processing",
      content: transcription.text,
      media_path: path,
      media_size: buffer.length,
      media_duration: duration,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  processMemory(memory.id).catch((err) => console.error("processMemory failed", err));

  return NextResponse.json(memory, { status: 201 });
}
