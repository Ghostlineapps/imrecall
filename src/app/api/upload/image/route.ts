import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory, geocodeAndLinkPlaceByCoords } from "@/lib/openai/classification";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vision restituisce data/ora dell'appuntamento come orario "a muro" (es.
// "alle 15" nella chat = le 15 in Italia), ma questo endpoint gira sui
// server Vercel in UTC: se inseriamo la stringa così com'è in una colonna
// timestamptz, Postgres la interpreta come UTC e l'orario finisce spostato
// di 1-2 ore (a seconda dell'ora legale). Convertiamo esplicitamente da
// Europe/Rome a UTC prima di salvare.
function romeLocalToUtcIso(localDateTime: string): string {
  const [datePart, timePart] = localDateTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "09:00").split(":").map(Number);

  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = romeOffsetMinutesAt(guessUtcMs);
  return new Date(guessUtcMs - offsetMinutes * 60000).toISOString();
}

function romeOffsetMinutesAt(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs)).reduce((acc: Record<string, string>, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const romeAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (romeAsUtcMs - utcMs) / 60000;
}

function buildVisionPrompt() {
  const today = new Date().toISOString().slice(0, 10);

  return `Oggi è il ${today}. Descrivi questa immagine in italiano in 1-2 frasi. Se contiene testo
leggibile (documento, cartello, ricevuta, scadenza, conversazione chat), trascrivilo integralmente.

Se l'immagine è un documento con una data di scadenza chiaramente visibile
(bollo, assicurazione, avviso fiscale, abbonamento, patente, carta d'identità,
passaporto, tessera sanitaria o qualsiasi altro documento con scadenza),
aggiungi alla fine una riga nel formato:
DEADLINE_DETECTED: {"title": "...", "due_date": "YYYY-MM-DD", "category": "bollo|assicurazione|fiscale|abbonamento|documento|altro"}
IMPORTANTE: "due_date" deve essere la data in cui la scadenza avviene davvero, MAI la data di inizio
validità. Se il testo dice "valido/a partire dal X" o "valido per N anni/mesi/giorni a partire dal X",
X è solo l'inizio: calcola tu la vera scadenza sommando la durata a X (es. "valido per un anno a
partire dal 19 agosto 2026" → due_date "2027-08-19", non "2026-08-19"). Se manca sia una scadenza
esplicita sia una durata calcolabile, ometti del tutto la riga DEADLINE_DETECTED.

Se l'immagine è invece uno screenshot di una chat (WhatsApp, Messenger, email
o simili) o un invito/conferma che propone un appuntamento, incontro, visita
o prenotazione con data e ora (anche espressa in modo relativo, es. "domani
alle 15" o "martedì prossimo" — calcolala rispetto a oggi), aggiungi alla
fine una riga nel formato:
APPOINTMENT_DETECTED: {"title": "...", "appointment_at": "YYYY-MM-DDTHH:MM", "location": "..."}
(usa null per "location" se non è indicata; se manca l'ora, usa "09:00")

Puoi omettere entrambe le righe se non pertinenti, oppure includerle entrambe
se l'immagine contiene sia una scadenza che un appuntamento.`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  // Coordinate GPS dello scatto, se il client è riuscito a estrarle (EXIF o,
  // in mancanza, posizione del dispositivo — vedi ImageCapture.tsx). Non
  // sono obbligatorie: molte foto (screenshot, immagini scaricate) non ne
  // hanno, e la memoria viene comunque creata normalmente.
  const rawLat = formData.get("latitude");
  const rawLon = formData.get("longitude");
  const latitude = typeof rawLat === "string" ? parseFloat(rawLat) : NaN;
  const longitude = typeof rawLon === "string" ? parseFloat(rawLon) : NaN;
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  // Vedi migrazione 020 / CaptureSheet healthMode: la sezione Salute manda
  // esplicitamente "true" quando l'utente carica un referto da lì.
  const isHealth = formData.get("is_health") === "true";

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
          { type: "text", text: buildVisionPrompt() },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } },
        ],
      },
    ],
  });

  const rawText = visionRes.choices[0].message.content ?? "";
  const deadlineMatch = rawText.match(/DEADLINE_DETECTED:\s*(\{.*\})/);
  const appointmentMatch = rawText.match(/APPOINTMENT_DETECTED:\s*(\{.*\})/);
  const description = rawText
    .replace(/DEADLINE_DETECTED:\s*\{.*\}/, "")
    .replace(/APPOINTMENT_DETECTED:\s*\{.*\}/, "")
    .trim();

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
      is_health: isHealth,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se Vision ha rilevato una scadenza o un appuntamento, li creiamo
  // automaticamente. Il risultato viene esposto nella risposta (campo
  // "detected") così il client può mostrare subito una conferma invece di
  // chiudere in silenzio, lasciando l'utente col dubbio che non sia
  // successo nulla.
  let detected: { type: "deadline" | "appointment"; title: string } | null = null;

  // Se Vision ha rilevato una scadenza nel documento, la crea automaticamente
  // (cattura intelligente da foto — vedi discussione sulle scadenze)
  if (deadlineMatch) {
    try {
      const parsed = JSON.parse(deadlineMatch[1]);
      if (parsed?.title && parsed?.due_date) {
        await supabase.from("deadlines").insert({
          user_id: user.id,
          memory_id: memory.id,
          title: parsed.title,
          due_date: parsed.due_date,
          category: parsed.category ?? "altro",
        });
        detected = { type: "deadline", title: parsed.title };
      }
    } catch (err) {
      console.error("Parsing DEADLINE_DETECTED fallito", err, deadlineMatch[1]);
      // parsing fallito: la memoria resta comunque salvata, l'utente può
      // creare la scadenza manualmente dalla vista dettaglio
    }
  }

  // Se Vision ha rilevato un appuntamento (es. screenshot di una chat che
  // propone un incontro), lo crea automaticamente invece di lasciare la
  // foto "persa" nei ricordi senza alcun promemoria collegato.
  if (appointmentMatch) {
    try {
      const parsed = JSON.parse(appointmentMatch[1]);
      const validDate =
        typeof parsed?.appointment_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(parsed.appointment_at);

      if (parsed?.title && validDate) {
        await supabase.from("appointments").insert({
          user_id: user.id,
          memory_id: memory.id,
          title: parsed.title,
          appointment_at: romeLocalToUtcIso(parsed.appointment_at),
          location: parsed.location ?? null,
          source: "photo",
        });
        detected = { type: "appointment", title: parsed.title };
      } else {
        console.error("APPOINTMENT_DETECTED con formato inatteso", parsed);
      }
    } catch (err) {
      console.error("Parsing APPOINTMENT_DETECTED fallito", err, appointmentMatch[1]);
      // parsing fallito: la memoria resta comunque salvata, l'utente può
      // creare l'appuntamento manualmente
    }
  }

  // Collega subito la foto al luogo (se abbiamo le coordinate): è quello
  // che rende possibile il resurfacing "sei tornato dove hai scattato
  // questa foto" — vedi nearby_memories() e /api/checkin. Fatto qui,
  // sincrono, perché la geocodifica di una singola coordinata è veloce e
  // vogliamo che il collegamento esista anche se processMemory (asincrono,
  // con retry) dovesse fallire più volte.
  if (hasCoords) {
    await geocodeAndLinkPlaceByCoords(supabase, user.id, memory.id, latitude, longitude).catch((err) =>
      console.error("geocodeAndLinkPlaceByCoords failed", err)
    );
  }

  processMemory(memory.id).catch((err) => console.error("processMemory failed", err));

  return NextResponse.json({ ...memory, detected }, { status: 201 });
}
