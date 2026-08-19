import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Le riunioni sono registrazioni lunghe (fino a 30-90 minuti a seconda del
// piano), quindi soglie diverse dalla nota vocale breve (/api/upload/audio,
// 5/30 min). Il sistema di abbonamenti non è ancora attivo (tutti su
// "free" di default): questi numeri sono un tetto ragionevole per l'MVP,
// da rivedere quando i piani a pagamento saranno reali.
const MAX_SECONDS_FREE = 1800; // 30 min
const MAX_SECONDS_PAID = 5400; // 90 min

// Whisper accetta al massimo 25MB per file. Il limite in secondi qui sopra
// è tarato per restare abbondantemente sotto quella soglia con la codifica
// webm/opus usata da MeetingRecorder.tsx, ma aggiungiamo comunque un
// controllo diretto sui byte come rete di sicurezza nel caso l'encoding
// reale (dipende da browser/microfono) sia più pesante del previsto.
const MAX_FILE_BYTES = 24 * 1024 * 1024;

// Cap sul testo salvato in `content` — stesso principio di MAX_STORED_CHARS
// in /api/upload/document, alzato perché le trascrizioni di riunioni sono
// per natura più lunghe di un documento medio.
const MAX_STORED_CHARS = 20000;

// Stessa conversione fuso orario duplicata in /api/upload/image e
// /api/upload/document — vedi commenti lì per il perché della duplicazione
// invece di condivisione.
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

function buildMeetingPrompt(excerpt: string, durationMinutes: number) {
  const today = new Date().toISOString().slice(0, 10);
  return `Oggi è il ${today}. Questa è la trascrizione automatica (Whisper) di una riunione o
call registrata, della durata di circa ${durationMinutes} minuti.

Scrivi SEMPRE in italiano, anche se la trascrizione è in un'altra lingua (traducila).
Rispondi in questo formato esatto, con queste etichette su righe separate:

TITOLO: un titolo breve e specifico (es. "Sync settimanale team prodotto", "Call cliente Acme - rinnovo contratto")
RIASSUNTO: 2-4 frasi su cosa è stato discusso e le eventuali decisioni prese
TEMI:
- primo tema trattato, con un accenno di dettaglio
- secondo tema trattato, con un accenno di dettaglio
(continua per ogni tema rilevante, uno per riga)

Se dalla riunione emerge una scadenza chiara (pagamento, consegna, documento con validità...), aggiungi in fondo:
DEADLINE_DETECTED: {"title": "...", "due_date": "YYYY-MM-DD", "category": "bollo|assicurazione|fiscale|abbonamento|documento|altro"}

Se emerge un prossimo appuntamento/follow-up con data (anche relativa, es. "ci sentiamo martedì prossimo" —
calcolala rispetto a oggi), aggiungi in fondo:
APPOINTMENT_DETECTED: {"title": "...", "appointment_at": "YYYY-MM-DDTHH:MM", "location": "..."}
(usa null per "location" se non indicata; se manca l'ora usa "09:00")

Puoi omettere le righe DEADLINE_DETECTED/APPOINTMENT_DETECTED se non pertinenti.

TRASCRIZIONE:
${excerpt}`;
}

// Le trascrizioni + il riassunto GPT su una riunione lunga possono richiedere
// più dei pochi secondi tipici delle altre route di upload — alziamo il
// timeout al massimo consentito sul piano Hobby di Vercel.
export const maxDuration = 60;

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

  const maxSeconds = profile?.subscription_tier === "free" ? MAX_SECONDS_FREE : MAX_SECONDS_PAID;
  if (duration > maxSeconds) {
    return NextResponse.json({ error: "duration_exceeded", max: maxSeconds }, { status: 402 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", max_mb: MAX_FILE_BYTES / (1024 * 1024) },
      { status: 413 }
    );
  }

  // Riusa il bucket "audio" e le sue policy RLS esistenti (008_storage.sql)
  // — stesso schema di path delle note vocali, nessuna distinzione di
  // bucket per tipo di memoria.
  const path = `${user.id}/${crypto.randomUUID()}.webm`;

  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(path, buffer, { contentType: "audio/webm" });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: signedUrl } = await supabase.storage.from("audio").createSignedUrl(path, 60 * 60);

  // Niente `language` fisso qui, a differenza della nota vocale breve
  // (sempre in italiano): una call di lavoro può benissimo essere in
  // inglese o in un'altra lingua — Whisper la rileva da solo, e il prompt
  // sopra chiede comunque titolo/riassunto in italiano (= la "traduzione"
  // richiesta nell'idea originale).
  const transcription = await openai.audio.transcriptions.create({
    file: new File([buffer], "meeting.webm", { type: "audio/webm" }),
    model: "whisper-1",
  });

  const fullTranscript = transcription.text ?? "";
  const durationMinutes = Math.max(1, Math.round(duration / 60));

  let title = `Riunione del ${new Date().toLocaleDateString("it-IT")}`;
  let content: string;
  let detected: { type: "deadline" | "appointment"; title: string } | null = null;
  let deadlineMatch: RegExpMatchArray | null = null;
  let appointmentMatch: RegExpMatchArray | null = null;

  if (!fullTranscript || fullTranscript.trim().length < 20) {
    content =
      "Registrazione salvata, ma la trascrizione è risultata vuota (audio troppo silenzioso o non udibile). Il file resta comunque ascoltabile dal dettaglio del ricordo.";
  } else {
    const excerpt = fullTranscript.slice(0, 20000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: buildMeetingPrompt(excerpt, durationMinutes) }],
    });

    const rawText = completion.choices[0].message.content ?? "";

    deadlineMatch = rawText.match(/DEADLINE_DETECTED:\s*(\{.*\})/);
    appointmentMatch = rawText.match(/APPOINTMENT_DETECTED:\s*(\{.*\})/);

    const titleMatch = rawText.match(/TITOLO:\s*(.+)/);
    const summaryMatch = rawText.match(
      /RIASSUNTO:\s*([\s\S]*?)(?=\nTEMI:|\nDEADLINE_DETECTED:|\nAPPOINTMENT_DETECTED:|$)/
    );
    const topicsMatch = rawText.match(
      /TEMI:\s*([\s\S]*?)(?=\nDEADLINE_DETECTED:|\nAPPOINTMENT_DETECTED:|$)/
    );

    if (titleMatch?.[1]?.trim()) title = titleMatch[1].trim();
    const summary = summaryMatch?.[1]?.trim() ?? "";
    const topics = topicsMatch?.[1]?.trim() ?? "";

    const truncatedTranscript = fullTranscript.trim().slice(0, MAX_STORED_CHARS);
    const truncatedNote =
      fullTranscript.trim().length > MAX_STORED_CHARS ? "\n\n[trascrizione troncata]" : "";

    content = [summary, topics, `Trascrizione integrale:\n${truncatedTranscript}${truncatedNote}`]
      .filter(Boolean)
      .join("\n\n");
  }

  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "meeting",
      status: "processing",
      title,
      content,
      media_path: path,
      media_url: signedUrl?.signedUrl,
      media_size: buffer.length,
      media_duration: duration,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Stessa logica di rilevamento automatico scadenze/appuntamenti già in
  // uso per foto e documenti — una riunione può benissimo generare un
  // follow-up ("ci risentiamo la settimana prossima") o una scadenza.
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
      console.error("Parsing DEADLINE_DETECTED fallito (riunione)", err, deadlineMatch[1]);
    }
  }

  if (appointmentMatch) {
    try {
      const parsed = JSON.parse(appointmentMatch[1]);
      const validDate =
        typeof parsed?.appointment_at === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(parsed.appointment_at);

      if (parsed?.title && validDate) {
        await supabase.from("appointments").insert({
          user_id: user.id,
          memory_id: memory.id,
          title: parsed.title,
          appointment_at: romeLocalToUtcIso(parsed.appointment_at),
          location: parsed.location ?? null,
          source: "meeting",
        });
        detected = { type: "appointment", title: parsed.title };
      } else {
        console.error("APPOINTMENT_DETECTED con formato inatteso (riunione)", parsed);
      }
    } catch (err) {
      console.error("Parsing APPOINTMENT_DETECTED fallito (riunione)", err, appointmentMatch[1]);
    }
  }

  processMemory(memory.id).catch((err) => console.error("processMemory failed (riunione)", err));

  return NextResponse.json({ ...memory, detected }, { status: 201 });
}
