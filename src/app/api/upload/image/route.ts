import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VISION_PROMPT = `Descrivi questa immagine in italiano in 1-2 frasi. Se contiene testo
leggibile (documento, cartello, ricevuta, scadenza), trascrivilo integralmente.
Se l'immagine è un documento con una data di scadenza chiaramente visibile
(bollo, assicurazione, avviso fiscale, abbonamento), aggiungi alla fine una riga
nel formato: DEADLINE_DETECTED: {"title": "...", "due_date": "YYYY-MM-DD", "category": "bollo|assicurazione|fiscale|abbonamento|documento|altro"}
Se non è un documento con scadenza, ometti quella riga.`;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large", max_mb: 10 }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("images")
    .upload(path, buffer, { contentType: file.type || "image/jpeg" });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: signedUrl } = await supabase.storage.from("images").createSignedUrl(path, 60 * 60);
  const base64 = buffer.toString("base64");

  const visionRes = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" } },
        ],
      },
    ],
  });

  const rawText = visionRes.choices[0].message.content ?? "";
  const deadlineMatch = rawText.match(/DEADLINE_DETECTED:\s*(\{.*\})/);
  const description = rawText.replace(/DEADLINE_DETECTED:\s*\{.*\}/, "").trim();

  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "image",
      status: "processing",
      content: description,
      media_path: path,
      media_url: signedUrl?.signedUrl,
      media_size: buffer.length,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se Vision ha rilevato una scadenza nel documento, la crea automaticamente
  // (cattura intelligente da foto — vedi discussione sulle scadenze)
  if (deadlineMatch) {
    try {
      const parsed = JSON.parse(deadlineMatch[1]);
      await supabase.from("deadlines").insert({
        user_id: user.id,
        memory_id: memory.id,
        title: parsed.title,
        due_date: parsed.due_date,
        category: parsed.category ?? "altro",
      });
    } catch {
      // parsing fallito: la memoria resta comunque salvata, l'utente può
      // creare la scadenza manualmente dalla vista dettaglio
    }
  }

  processMemory(memory.id).catch((err) => console.error("processMemory failed", err));

  return NextResponse.json(memory, { status: 201 });
}
