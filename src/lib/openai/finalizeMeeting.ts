import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";

// 2026-09-26: spostata qui da /api/upload/meeting/route.ts (insieme a tutti
// gli helper che usa sotto) perché Next.js valida gli export di un file
// route.ts dell'App Router — solo i metodi HTTP e le opzioni di
// configurazione di route segment (maxDuration, dynamic, ecc.) sono
// ammessi, qualunque altro export named causa un errore di build
// ("lint_or_type_error"). Il primo tentativo di condividere questa
// pipeline con /api/memories/[id]/retry/route.ts esportando
// `finalizeMeeting` direttamente da route.ts ha infatti rotto il deploy
// (4 build consecutive in errore) — spostarla in un modulo lib normale
// risolve senza perdere la condivisione con la route di retry.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

MAPPA:
- primo argomento principale (poche parole, senza parentesi o due punti)
  - eventuale sotto-punto (2 spazi di indentazione)
  - eventuale sotto-punto
- secondo argomento principale
  - eventuale sotto-punto
(massimo 2 livelli di profondità — argomento e sotto-punti — pensata per
diventare una mappa mentale visiva: usa testo breve, senza parentesi,
virgolette o due punti nel testo di ogni punto; ometti i sotto-punti se non
ce ne sono per un argomento)

Se dalla riunione emerge una scadenza chiara (pagamento, consegna, documento con validità...), aggiungi in fondo:
DEADLINE_DETECTED: {"title": "...", "due_date": "YYYY-MM-DD", "category": "bollo|assicurazione|fiscale|abbonamento|documento|altro"}
IMPORTANTE: "due_date" deve essere la data in cui la scadenza avviene davvero, MAI una data di inizio
validità. Se si parla di "valido/a partire da X" o "valido per N anni/mesi/giorni a partire da X", X è
solo l'inizio: calcola tu la vera scadenza sommando la durata a X. Se manca sia una scadenza esplicita
sia una durata calcolabile, ometti del tutto la riga DEADLINE_DETECTED.

Se emerge un prossimo appuntamento/follow-up con data (anche relativa, es. "ci sentiamo martedì prossimo" —
calcolala rispetto a oggi), aggiungi in fondo:
APPOINTMENT_DETECTED: {"title": "...", "appointment_at": "YYYY-MM-DDTHH:MM", "location": "..."}
(usa null per "location" se non indicata; se manca l'ora usa "09:00")

Puoi omettere le righe DEADLINE_DETECTED/APPOINTMENT_DETECTED se non pertinenti.

Se la lingua parlata nella trascrizione qui sotto NON è già l'italiano, aggiungi per
ultimo anche una traduzione INTEGRALE in italiano di tutta la trascrizione (non un
riassunto: la traduzione completa, dall'inizio alla fine, dell'intero testo che segue),
con questa etichetta:
TRASCRIZIONE_TRADOTTA:
[qui la traduzione integrale in italiano, senza tagliarla]
Se la trascrizione qui sotto è già in italiano, ometti del tutto questa sezione (non
ripetere il testo, sarebbe ridondante — l'utente vedrà comunque la trascrizione
originale).

TRASCRIZIONE:
${excerpt}`;
}

// Nodo di una mappa mentale strutturata (albero JSON), sostituisce la
// vecchia sintassi mermaid: la versione precedente (buildMindMapMermaid,
// rimossa) generava un SVG statico via mermaid.js — l'utente ha segnalato
// (2026-09-17) che sul telefono sembrava "una semplice immagine" senza
// possibilità di ingrandire, e ha chiesto qualcosa di più strutturato.
// Il frontend (src/components/memory/MindMapTree.tsx) renderizza questo
// albero come nodi veri (non un disegno), espandibili/collassabili al tocco.
interface MindMapTreeNode {
  label: string;
  children?: MindMapTreeNode[];
}

// Converte la sezione MAPPA: (elenco puntato con indentazione, vedi prompt
// sopra) generata da GPT in un albero JSON. Salvata in metadata.mind_map,
// non nel campo `content` (che resta testo semplice, letto anche da
// ricerca/chat). Le memorie create prima di questo cambio hanno ancora una
// stringa mermaid in metadata.mind_map — il frontend distingue i due
// formati con un semplice controllo di tipo (string vs object) e usa il
// vecchio componente MindMap per quelle legacy.
function buildMindMapTree(rawMap: string, rootLabel: string): MindMapTreeNode | null {
  if (!rawMap.trim()) return null;

  // Niente più limite di 80 caratteri né rimozione aggressiva di parentesi:
  // qui il testo va semplicemente dentro un elemento DOM, non dentro una
  // sintassi di diagramma con caratteri riservati — basta ripulire il
  // trattino/asterisco iniziale del bullet.
  const sanitize = (s: string) => s.replace(/^[-*]\s*/, "").trim().slice(0, 200);

  const root: MindMapTreeNode = { label: sanitize(rootLabel) || "Riunione", children: [] };
  let currentTopic: MindMapTreeNode | null = null;

  for (const rawLine of rawMap.split("\n")) {
    if (!rawLine.trim()) continue;
    const leadingSpaces = rawLine.match(/^(\s*)/)?.[1].length ?? 0;
    const label = sanitize(rawLine);
    if (!label) continue;

    // Il prompt chiede solo 2 livelli (argomento / sotto-punto), indentati
    // con 2 spazi nel testo di GPT — qualunque indentazione >= 2 diventa
    // sotto-punto dell'ultimo argomento visto, il resto è un nuovo
    // argomento di primo livello sotto la radice.
    if (leadingSpaces >= 2 && currentTopic) {
      currentTopic.children = currentTopic.children ?? [];
      currentTopic.children.push({ label });
    } else {
      currentTopic = { label };
      root.children!.push(currentTopic);
    }
  }

  // Niente mappa se non è emerso nemmeno un argomento di primo livello (es.
  // risposta malformata) — meglio nessuna mappa che una mappa vuota.
  return root.children!.length ? root : null;
}

// Copia esplicita in un ArrayBuffer "piatto": il tipo di Buffer.buffer è
// ArrayBufferLike (può includere SharedArrayBuffer), che il DOM lib non
// accetta come BlobPart per File/Blob — vedi lo stesso helper in
// finalizeAudio.ts.
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

// Margine di sicurezza sotto maxDuration (300s, in /api/upload/meeting/route.ts
// e in /api/memories/[id]/retry/route.ts, gli unici due chiamanti):
// abortiamo NOI le chiamate a OpenAI (trascrizione + riassunto) prima che
// sia Vercel a uccidere l'intera funzione. Senza questo, una riunione troppo
// lunga per completare in tempo lasciava la memoria bloccata per sempre su
// "in elaborazione" (bug segnalato 2026-09-22) — con l'abort esplicito
// otteniamo invece un errore chiaro e immediato (vedi catch sotto), sempre,
// indipendentemente da quanto la registrazione superi il budget disponibile.
const DEADLINE_MS = 270_000;

// Trascrizione Whisper + riassunto/temi/mappa GPT + rilevamento
// scadenza/appuntamento per una riunione già salvata come memoria
// segnaposto. Chiamata da due punti: dopo l'upload iniziale
// (/api/upload/meeting/route.ts) e da un nuovo tentativo su una riunione
// già fallita (/api/memories/[id]/retry/route.ts, aggiunta 2026-09-26 dopo
// che una riunione rimasta bloccata dal 22/09 non aveva alcun modo di
// essere rielaborata). Gira dentro waitUntil() in entrambi i casi, quindi
// DOPO che la risposta HTTP è già stata inviata al client: usiamo
// createServiceClient() invece del client legato ai cookie della richiesta
// (stesso motivo per cui processMemory() in classification.ts fa lo
// stesso — un client basato su cookie non è affidabile fuori dal ciclo di
// vita della richiesta che lo ha creato).
export async function finalizeMeeting(memoryId: string, buffer: Buffer, duration: number) {
  const supabase = createServiceClient();

  const { data: memory } = await supabase.from("memories").select("user_id").eq("id", memoryId).single();
  if (!memory) return; // la memoria è stata cancellata nel frattempo

  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), DEADLINE_MS);

  try {
    // Niente `language` fisso qui, a differenza della nota vocale breve
    // (sempre in italiano): una call di lavoro può benissimo essere in
    // inglese o in un'altra lingua — Whisper la rileva da solo, e il prompt
    // sotto chiede comunque titolo/riassunto in italiano (= la "traduzione"
    // richiesta nell'idea originale).
    const transcription = await openai.audio.transcriptions.create(
      {
        file: new File([bufferToArrayBuffer(buffer)], "meeting.webm", { type: "audio/webm" }),
        model: "whisper-1",
      },
      { signal: deadline.signal }
    );

    const fullTranscript = transcription.text ?? "";
    const durationMinutes = Math.max(1, Math.round(duration / 60));

    let title = `Riunione del ${new Date().toLocaleDateString("it-IT")}`;
    let content: string;
    let detected: { type: "deadline" | "appointment"; title: string } | null = null;
    let deadlineMatch: RegExpMatchArray | null = null;
    let appointmentMatch: RegExpMatchArray | null = null;
    let mindMapTree: MindMapTreeNode | null = null;
    // Riassunto/temi/trascrizione salvati anche separatamente (oltre al
    // classico `content` concatenato, mantenuto per ricerca/chat) così il
    // frontend può mostrarli come sezioni distinte invece di un unico blocco
    // di testo. Assenti per registrazioni senza trascrizione utile
    // (fallback: il frontend mostra `content` come prima).
    let structuredMeta: { summary?: string; topics?: string; transcript?: string } = {};

    if (!fullTranscript || fullTranscript.trim().length < 20) {
      content =
        "Registrazione salvata, ma la trascrizione è risultata vuota (audio troppo silenzioso o non udibile). Il file resta comunque ascoltabile dal dettaglio del ricordo.";
    } else {
      const excerpt = fullTranscript.slice(0, 20000);
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildMeetingPrompt(excerpt, durationMinutes) }],
          // Di default la risposta potrebbe essere tagliata: oltre ai campi
          // strutturati ora chiediamo anche l'eventuale traduzione integrale
          // della trascrizione (fino a 20.000 caratteri, vedi TRASCRIZIONE_TRADOTTA
          // nel prompt), che da sola può valere qualche migliaio di token.
          max_tokens: 16000,
        },
        { signal: deadline.signal }
      );

      const rawText = completion.choices[0].message.content ?? "";

      deadlineMatch = rawText.match(/DEADLINE_DETECTED:\s*(\{.*\})/);
      appointmentMatch = rawText.match(/APPOINTMENT_DETECTED:\s*(\{.*\})/);

      const titleMatch = rawText.match(/TITOLO:\s*(.+)/);
      const summaryMatch = rawText.match(
        /RIASSUNTO:\s*([\s\S]*?)(?=\nTEMI:|\nDEADLINE_DETECTED:|\nAPPOINTMENT_DETECTED:|$)/
      );
      const topicsMatch = rawText.match(
        /TEMI:\s*([\s\S]*?)(?=\nMAPPA:|\nDEADLINE_DETECTED:|\nAPPOINTMENT_DETECTED:|$)/
      );
      const mapMatch = rawText.match(
        /MAPPA:\s*([\s\S]*?)(?=\nDEADLINE_DETECTED:|\nAPPOINTMENT_DETECTED:|\nTRASCRIZIONE_TRADOTTA:|$)/
      );
      // Presente solo se la riunione non era già in italiano (vedi prompt) —
      // sempre l'ultima sezione della risposta, cattura tutto fino alla fine.
      const translatedMatch = rawText.match(/TRASCRIZIONE_TRADOTTA:\s*([\s\S]*)$/);

      if (titleMatch?.[1]?.trim()) title = titleMatch[1].trim();
      const summary = summaryMatch?.[1]?.trim() ?? "";
      const topics = topicsMatch?.[1]?.trim() ?? "";
      const translatedTranscript = translatedMatch?.[1]?.trim() ?? "";

      mindMapTree = buildMindMapTree(mapMatch?.[1] ?? "", title);

      const truncatedTranscript = fullTranscript.trim().slice(0, MAX_STORED_CHARS);
      const truncatedNote =
        fullTranscript.trim().length > MAX_STORED_CHARS ? "\n\n[trascrizione troncata]" : "";

      // Se la riunione non era in italiano, teniamo sia la traduzione (più
      // comoda da leggere e utile per la ricerca semantica in italiano) sia
      // il testo originale (per controllare termini esatti, nomi, cifre) —
      // scelta dell'utente rispetto a "sostituisci l'originale" o "non tradurre".
      const transcriptSection = translatedTranscript
        ? `Trascrizione (tradotta in italiano):\n${translatedTranscript}${truncatedNote}\n\nTrascrizione originale:\n${truncatedTranscript}${truncatedNote}`
        : `Trascrizione integrale:\n${truncatedTranscript}${truncatedNote}`;

      content = [summary, topics, transcriptSection].filter(Boolean).join("\n\n");
      structuredMeta = {
        ...(summary ? { summary } : {}),
        ...(topics ? { topics } : {}),
        transcript: transcriptSection,
      };
    }

    // Mappa mentale (albero JSON, vedi buildMindMapTree sopra e
    // src/components/memory/MindMapTree.tsx per il rendering) + riassunto/temi/
    // trascrizione separati (vedi structuredMeta sopra) — riusa la colonna
    // `metadata` jsonb già esistente, nessuna migrazione DB necessaria.
    const metadata: Record<string, unknown> = { ...structuredMeta };
    if (mindMapTree) metadata.mind_map = mindMapTree;

    await supabase
      .from("memories")
      .update({
        title,
        content,
        ...(Object.keys(metadata).length ? { metadata } : {}),
      })
      .eq("id", memoryId);

    // Stessa logica di rilevamento automatico scadenze/appuntamenti già in
    // uso per foto e documenti — una riunione può benissimo generare un
    // follow-up ("ci risentiamo la settimana prossima") o una scadenza.
    if (deadlineMatch) {
      try {
        const parsed = JSON.parse(deadlineMatch[1]);
        if (parsed?.title && parsed?.due_date) {
          await supabase.from("deadlines").insert({
            user_id: memory.user_id,
            memory_id: memoryId,
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
            user_id: memory.user_id,
            memory_id: memoryId,
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

    void detected; // non più restituito al client (vedi commento in POST) — tenuto per leggibilità/futuro uso
  } catch (err) {
    // Trascrizione o riassunto falliti (es. Whisper/OpenAI in errore): la
    // memoria non deve restare bloccata per sempre su "in elaborazione" con
    // il testo segnaposto — status "error" + un contenuto chiaro, come già
    // fatto per la trascrizione vuota sopra. Il file audio resta comunque
    // ascoltabile: non lo rimuoviamo.
    const timedOut = deadline.signal.aborted;
    console.error("finalizeMeeting: trascrizione/riassunto falliti", timedOut ? "(timeout)" : "", err);
    await supabase
      .from("memories")
      .update({
        status: "error",
        error_message: timedOut ? "processing_timeout" : err instanceof Error ? err.message : "unknown_error",
        content: timedOut
          ? "Registrazione salvata, ma è troppo lunga per essere elaborata entro i limiti della piattaforma. Prova con una registrazione più breve, o dividila in più registrazioni separate. Il file resta comunque ascoltabile dal dettaglio del ricordo."
          : "Registrazione salvata, ma l'elaborazione (trascrizione/riassunto) è fallita. Il file resta comunque ascoltabile dal dettaglio del ricordo.",
      })
      .eq("id", memoryId);
    throw err; // lascia loggare anche al chiamante (waitUntil in POST/retry)
  } finally {
    clearTimeout(deadlineTimer);
  }
}
