import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import { extractDocumentText } from "@/lib/documents/extractText";
import {
  FREE_DOCUMENTS_PER_MONTH,
  FREE_MEMORIES_PER_MONTH,
  isDocumentQuotaExceeded,
  isMemoryQuotaExceeded,
} from "@/lib/subscription/limits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Stesso limite/pattern di /api/upload/image, ma i documenti (specie PDF a
// più pagine) possono pesare un po' di più — 15MB invece di 10.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Cap sul testo salvato in `content`: generateEmbedding tronca comunque a
// 8000 caratteri e classifyMemory (gpt-4o-mini) non ha guardrail propri —
// per un documento molto lungo (es. un export enorme) evitiamo di mandargli
// tutto il testo. 15000 caratteri bastano per la maggior parte di fatture,
// contratti, biglietti, estratti conto di poche pagine.
const MAX_STORED_CHARS = 15000;

// Stessa conversione fuso orario usata in /api/upload/image: Vision/GPT
// ragionano in orario "a muro" Europa/Roma, ma la funzione gira in UTC su
// Vercel. Duplicata qui volutamente invece di condivisa, per non rischiare
// di toccare la route immagini (già testata in produzione) in questo giro.
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

function buildDocumentPrompt(fileName: string, excerpt: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `Oggi è il ${today}. Questo è il testo estratto dal file "${fileName}".

Scrivi in italiano, in 1-2 frasi, una descrizione di cosa contiene (es. "Fattura del ristorante
X del 12 agosto", "Contratto abbonamento palestra", "Biglietto aereo per Parigi del 3 settembre").
Non riscrivere il contenuto integrale: verrà allegato automaticamente subito dopo la tua descrizione,
non serve che tu lo ripeta.

Se il documento contiene una data di scadenza chiaramente indicata (bollo, assicurazione, abbonamento,
fattura da pagare, documento con validità, o qualsiasi altra scadenza), aggiungi alla fine una riga:
DEADLINE_DETECTED: {"title": "...", "due_date": "YYYY-MM-DD", "category": "bollo|assicurazione|fiscale|abbonamento|documento|altro"}
IMPORTANTE: "due_date" deve essere la data in cui la scadenza avviene davvero, MAI la data di inizio
validità. Se il testo dice "valido/a partire dal X" o "valido per N anni/mesi/giorni a partire dal X",
X è solo l'inizio: calcola tu la vera scadenza sommando la durata a X (es. "valido per un anno a
partire dal 19 agosto 2026" → due_date "2027-08-19", non "2026-08-19"). Se manca sia una scadenza
esplicita sia una durata calcolabile, ometti del tutto la riga DEADLINE_DETECTED.

Se il documento è un invito, una prenotazione o una conferma con data e ora di un appuntamento/evento
(anche relativa, es. "domani alle 15" — calcolala rispetto a oggi), aggiungi alla fine una riga:
APPOINTMENT_DETECTED: {"title": "...", "appointment_at": "YYYY-MM-DDTHH:MM", "location": "..."}
(usa null per "location" se non indicata; se manca l'ora usa "09:00")

Puoi omettere entrambe le righe se non pertinenti.

TESTO DEL DOCUMENTO:
${excerpt}`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Enforcement limite tier Free: 100 memorie/mese, condiviso tra tutti i
  // tipi (testo, link, audio, foto, documento, riunione) — vedi
  // src/lib/subscription/limits.ts.
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (await isMemoryQuotaExceeded(supabase, user.id, profile?.subscription_tier)) {
    return NextResponse.json({ error: "limit_reached", limit: FREE_MEMORIES_PER_MONTH }, { status: 402 });
  }

  // Sotto-quota specifica per i documenti (5/mese Free) — vedi
  // src/lib/subscription/limits.ts. Come il resto dei limiti di piano, resta
  // disattivata finché SUBSCRIPTION_LIMITS_ENABLED non è impostato: l'app è
  // ancora in fase di test con pochi utenti.
  if (await isDocumentQuotaExceeded(supabase, user.id, profile?.subscription_tier)) {
    return NextResponse.json({ error: "document_limit_reached", limit: FREE_DOCUMENTS_PER_MONTH }, { status: 402 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });
  // Vedi migrazione 020 / CaptureSheet healthMode: la sezione Salute manda
  // esplicitamente "true" quando l'utente carica un referto da lì.
  const isHealth = formData.get("is_health") === "true";

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file_too_large", max_mb: MAX_FILE_BYTES / (1024 * 1024) }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "documento";
  const ext = (fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || "bin";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 60);

  const extracted = await extractDocumentText(buffer, fileName, file.type || "");

  let description: string;
  let detected: { type: "deadline" | "appointment"; title: string } | null = null;
  let deadlineMatch: RegExpMatchArray | null = null;
  let appointmentMatch: RegExpMatchArray | null = null;

  if (extracted.kind === "unsupported") {
    description = `File "${fileName}" caricato, ma questo formato non è ancora supportato per l'estrazione del testo (per ora: PDF, TXT, CSV, MD). Il file resta comunque salvato e apribile dal dettaglio del ricordo.`;
  } else if (!extracted.text || extracted.text.trim().length < 20) {
    description = `File "${fileName}" caricato, ma non contiene testo estraibile (probabilmente un PDF scansionato senza livello di testo, o un file vuoto). Il file resta comunque salvato e apribile dal dettaglio del ricordo.`;
  } else {
    const excerpt = extracted.text.slice(0, 6000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: buildDocumentPrompt(fileName, excerpt) }],
    });

    const rawText = completion.choices[0].message.content ?? "";
    deadlineMatch = rawText.match(/DEADLINE_DETECTED:\s*(\{.*\})/);
    appointmentMatch = rawText.match(/APPOINTMENT_DETECTED:\s*(\{.*\})/);
    const gptDescription = rawText
      .replace(/DEADLINE_DETECTED:\s*\{.*\}/, "")
      .replace(/APPOINTMENT_DETECTED:\s*\{.*\}/, "")
      .trim();

    const fullText = extracted.text.trim().slice(0, MAX_STORED_CHARS);
    const truncatedNote = extracted.text.trim().length > MAX_STORED_CHARS ? "\n\n[testo troncato]" : "";
    description = `${gptDescription}\n\n${fullText}${truncatedNote}`;
  }

  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "document",
      status: "processing",
      title: fileName,
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

  // Stessa logica di rilevamento automatico scadenze/appuntamenti già in
  // uso per le foto (vedi /api/upload/image) — un PDF di un abbonamento
  // palestra o un biglietto aereo può innescarla allo stesso modo.
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
      console.error("Parsing DEADLINE_DETECTED fallito (documento)", err, deadlineMatch[1]);
    }
  }

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
          source: "document",
        });
        detected = { type: "appointment", title: parsed.title };
      } else {
        console.error("APPOINTMENT_DETECTED con formato inatteso (documento)", parsed);
      }
    } catch (err) {
      console.error("Parsing APPOINTMENT_DETECTED fallito (documento)", err, appointmentMatch[1]);
    }
  }

  processMemory(memory.id).catch((err) => console.error("processMemory failed (documento)", err));

  return NextResponse.json({ ...memory, detected }, { status: 201 });
}
