import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const duration = Number(formData.get("duration") ?? 0);

  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  // Limite durata per tier: 5 min Free, 30 min Premium
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const maxSeconds = profile?.subscription_tier === "free" ? 300 : 1800;
  if (duration > maxSeconds) {
    return NextResponse.json({ error: "duration_exceeded", max: maxSeconds }, { status: 402 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.webm`;
  const buffer = Buffer.from(await file.arrayBuffer());

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
