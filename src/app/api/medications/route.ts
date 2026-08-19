import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";

// Niente chiamate a OpenAI qui: a differenza degli altri upload, nome e
// dose del farmaco li scrive l'utente stesso (dalla prescrizione del
// medico) — non c'è nulla da far leggere a GPT. La foto della confezione,
// se allegata, è solo un riferimento visivo salvato col ricordo.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RECURRENCE_TYPES = ["daily", "weekly", "interval", "monthly"];

// Legge e valida i campi di ricorrenza (migrazione 019) da un FormData,
// condiviso fra POST (creazione) e — coi dovuti adattamenti — PATCH. Ritorna
// una stringa di errore se qualcosa non torna, altrimenti l'oggetto pronto
// per l'insert/update.
function parseRecurrence(formData: FormData): { error: string } | { fields: Record<string, unknown> } {
  const recurrenceType = (formData.get("recurrence_type") as string | null) || "daily";
  if (!RECURRENCE_TYPES.includes(recurrenceType)) {
    return { error: "invalid_recurrence_type" };
  }

  const fields: Record<string, unknown> = { recurrence_type: recurrenceType, days_of_week: null, interval_days: null, interval_anchor_date: null, day_of_month: null };

  if (recurrenceType === "weekly") {
    const raw = formData.get("days_of_week") as string | null;
    let days: number[] = [];
    try {
      days = JSON.parse(raw || "[]");
    } catch {
      return { error: "invalid_days_of_week" };
    }
    days = Array.from(new Set(days)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (days.length === 0) return { error: "days_of_week_required" };
    fields.days_of_week = days;
  }

  if (recurrenceType === "interval") {
    const intervalDays = Number(formData.get("interval_days"));
    if (!Number.isInteger(intervalDays) || intervalDays < 1) {
      return { error: "invalid_interval_days" };
    }
    fields.interval_days = intervalDays;
    const anchor = (formData.get("interval_anchor_date") as string | null) || null;
    fields.interval_anchor_date = anchor && DATE_RE.test(anchor) ? anchor : null;
  }

  if (recurrenceType === "monthly") {
    const dayOfMonth = Number(formData.get("day_of_month"));
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { error: "invalid_day_of_month" };
    }
    fields.day_of_month = dayOfMonth;
  }

  const startDate = (formData.get("start_date") as string | null) || null;
  const endDate = (formData.get("end_date") as string | null) || null;
  fields.start_date = startDate && DATE_RE.test(startDate) ? startDate : null;
  fields.end_date = endDate && DATE_RE.test(endDate) ? endDate : null;
  if (fields.start_date && fields.end_date && (fields.start_date as string) > (fields.end_date as string)) {
    return { error: "end_date_before_start_date" };
  }

  return { fields };
}

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

  const recurrence = parseRecurrence(formData);
  if ("error" in recurrence) {
    return NextResponse.json({ error: recurrence.error }, { status: 400 });
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
      // Ogni farmaco è per natura "salute", a prescindere da dove è stato
      // aggiunto — compare quindi sempre nella sezione Salute (migrazione 020).
      is_health: true,
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
      ...recurrence.fields,
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

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Filtro opzionale usato dal dettaglio ricordo, per trovare il farmaco
  // collegato a una specifica memoria senza scaricare tutta la lista —
  // vedi MedicationSchedule.tsx.
  const memoryId = req.nextUrl.searchParams.get("memory_id");

  let query = supabase.from("medications").select("*").eq("user_id", user.id).eq("active", true);
  query = memoryId ? query.eq("memory_id", memoryId) : query.order("name", { ascending: true });

  const { data: medications, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medications });
}
