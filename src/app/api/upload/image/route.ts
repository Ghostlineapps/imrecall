import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { processMemory, geocodeAndLinkPlaceByCoords } from "@/lib/openai/classification";
import { reverseGeocodePlaceName } from "@/lib/utils/geocoding";
import { FREE_MEMORIES_PER_MONTH, isMemoryQuotaExceeded } from "@/lib/subscription/limits";

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

// placeName arriva dal reverse-geocoding delle coordinate GPS dello scatto
// (vedi reverseGeocodePlaceName in lib/utils/geocoding.ts), non da Vision:
// senza questo, la descrizione di una foto scattata alla Reggia di Caserta
// diceva solo "un maestoso edificio storico" — GPT-4 Vision vede i pixel,
// non sa dove ti trovavi. È null quando la foto non ha coordinate o il
// punto non corrisponde a un luogo/locale riconoscibile (es. un dettaglio
// di un piatto senza nulla di identificabile intorno): in quel caso il
// prompt resta puramente visivo come prima, invece di inventare un nome.
function buildVisionPrompt(placeName: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const placeContext = placeName
    ? `\nQuesta foto è stata scattata presso: "${placeName}". Se è pertinente, usa questo nome nella
descrizione (es. "Reggia di Caserta" invece di "un edificio storico"), ma NON aggiungere altri
dettagli su questo luogo che non vedi realmente nell'immagine.\n`
    : "";

  return `Oggi è il ${today}. Descrivi questa immagine in italiano in 1-2 frasi. Se contiene testo
leggibile (documento, cartello, ricevuta, scadenza, conversazione chat), trascrivilo integralmente.
${placeContext}

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

Se l'immagine è uno scontrino o una ricevuta di acquisto (supermercato,
ristorante, benzina, farmacia, negozio...), aggiungi alla fine una riga nel
formato:
RECEIPT_DETECTED: {"vendor": "...", "amount": 12.50, "expense_date": "YYYY-MM-DD", "category": "spesa|trasporti|ristorazione|casa|salute|svago|altro"}
"amount" è il TOTALE pagato (l'importo finale, non un singolo articolo).
Usa "expense_date" la data dello scontrino se leggibile, altrimenti oggi.
Scegli la categoria più adatta tra quelle elencate; se nessuna calza bene usa
"altro". Se l'immagine non è uno scontrino/ricevuta, ometti del tutto la riga.

Puoi omettere tutte le righe se non pertinenti, oppure includerne più di una
se l'immagine contiene più elementi rilevabili contemporaneamente.`;
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
  // Vedi migrazione 022 / CaptureSheet expenseMode: la sezione Spese manda
  // esplicitamente "true" quando l'utente carica uno scontrino da lì.
  const isExpense = formData.get("is_expense") === "true";
  // Vedi migrazione 028 / CaptureSheet pregnancyMode: la sezione
  // Gravidanza manda esplicitamente "true" per i referti/esami caricati
  // da lì (che restano comunque visibili anche in Salute, vedi is_health
  // sotto: sono passati entrambi insieme dalla pagina /gravidanza).
  const isPregnancy = formData.get("is_pregnancy") === "true";

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

  // Vedi buildVisionPrompt: senza questo, foto scattate a un monumento o
  // locale riconoscibile venivano descritte in modo puramente generico.
  const placeName = hasCoords
    ? await reverseGeocodePlaceName(latitude, longitude).catch(() => null)
    : null;

  const visionRes = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildVisionPrompt(placeName) },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } },
        ],
      },
    ],
  });

  const rawText = visionRes.choices[0].message.content ?? "";
  const deadlineMatch = rawText.match(/DEADLINE_DETECTED:\s*(\{.*\})/);
  const appointmentMatch = rawText.match(/APPOINTMENT_DETECTED:\s*(\{.*\})/);
  const receiptMatch = rawText.match(/RECEIPT_DETECTED:\s*(\{.*\})/);
  const description = rawText
    .replace(/DEADLINE_DETECTED:\s*\{.*\}/, "")
    .replace(/APPOINTMENT_DETECTED:\s*\{.*\}/, "")
    .replace(/RECEIPT_DETECTED:\s*\{.*\}/, "")
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
      is_expense: isExpense,
      is_pregnancy: isPregnancy,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se Vision ha rilevato una scadenza o un appuntamento, li creiamo
  // automaticamente. Il risultato viene esposto nella risposta (campo
  // "detected") così il client può mostrare subito una conferma invece di
  // chiudere in silenzio, lasciando l'utente col dubbio che non sia
  // successo nulla.
  let detected: { type: "deadline" | "appointment" | "expense"; title: string } | null = null;

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

  // Se Vision ha rilevato uno scontrino/ricevuta, crea la spesa
  // automaticamente — indipendentemente da dove è stata caricata la foto
  // (come per scadenze e appuntamenti), non solo dalla sezione Spese. Se la
  // lettura è imprecisa, l'utente la corregge da /expenses (PATCH
  // /api/expenses/[id]) invece di dover ricaricare la foto.
  if (receiptMatch) {
    try {
      const parsed = JSON.parse(receiptMatch[1]);
      const amount = Number(parsed?.amount);
      const validDate = typeof parsed?.expense_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expense_date);
      const CATEGORIES = ["spesa", "trasporti", "ristorazione", "casa", "salute", "svago", "altro"];
      const category = CATEGORIES.includes(parsed?.category) ? parsed.category : "altro";

      if (Number.isFinite(amount) && amount > 0) {
        await supabase.from("expenses").insert({
          user_id: user.id,
          memory_id: memory.id,
          vendor: typeof parsed?.vendor === "string" ? parsed.vendor.slice(0, 200) : null,
          amount,
          category,
          expense_date: validDate ? parsed.expense_date : new Date().toISOString().slice(0, 10),
          source: "photo",
        });
        detected = { type: "expense", title: parsed?.vendor ? `${parsed.vendor} · €${amount.toFixed(2)}` : `€${amount.toFixed(2)}` };

        // La foto è confermata uno scontrino anche se non era stata caricata
        // dalla sezione Spese (es. dalla barra di cattura generica).
        if (!isExpense) {
          await supabase.from("memories").update({ is_expense: true }).eq("id", memory.id);
        }
      } else {
        console.error("RECEIPT_DETECTED con importo non valido", parsed);
      }
    } catch (err) {
      console.error("Parsing RECEIPT_DETECTED fallito", err, receiptMatch[1]);
      // parsing fallito: la memoria resta comunque salvata, l'utente può
      // aggiungere la spesa manualmente dalla sezione Spese
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
