import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import { waitUntil } from "@vercel/functions";
import {
  FREE_MEMORIES_PER_MONTH,
  isMemoryQuotaExceeded,
  limitsEnabled,
  transcriptionMinutesQuota,
  transcriptionMinutesUsedThisMonth,
} from "@/lib/subscription/limits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tetto per singola riunione: 30 min Free, 50 min Premium.
// 2026-09-22: abbassato da 90 a 50 min dopo che una riunione di ~20 min è
// rimasta bloccata per sempre su "in elaborazione" — con maxDuration=60 (il
// valore di prima) il lavoro in background (Whisper + riassunto GPT, vedi
// finalizeMeeting sotto) veniva ucciso a metà senza nemmeno un errore
// visibile. Verificato nelle impostazioni Vercel del progetto (Settings →
// Functions) che il vero tetto del piano Hobby con Fluid Compute abilitato
// è oggi 300s, non 60s. Alzato maxDuration di conseguenza (sotto) e aggiunto
// un abort esplicito (DEADLINE_MS, sotto) con un margine di sicurezza sotto
// quel tetto. 50 min è la soglia che riteniamo ragionevolmente raggiungibile
// in quel budget (trascrizione + riassunto insieme); senza dati reali sul
// throughput di Whisper su file molto lunghi non possiamo garantirlo con
// certezza oltre questo — per una garanzia solida sull'intera durata
// originariamente promessa (90 min) andrebbe alzato il piano Vercel a Pro
// (maxDuration fino a 1800s in beta) o implementata la segmentazione audio
// lato client (non ancora fatta). Non più allineato 1:1 al monte ore
// mensile (60/600 min, vedi src/lib/subscription/limits.ts): quello resta
// la vera leva free/premium, questo è solo un tetto tecnico per riunione.
const MAX_SECONDS_FREE = 1800; // 30 min
const MAX_SECONDS_PAID = 3000; // 50 min

// Whisper accetta al massimo 25MB per file. MeetingRecorder.tsx forza
// esplicitamente un bitrate audio basso (32kbps, ok per il parlato) proprio
// per restare ben sotto questa soglia anche a 90 minuti (~21.6MB attesi);
// aggiungiamo comunque un controllo diretto sui byte come rete di sicurezza
// nel caso l'encoding reale (dipende da browser/microfono) sia più pesante
// del previsto.
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

// Le trascrizioni + il riassunto GPT su una riunione lunga possono richiedere
// più dei pochi secondi tipici delle altre route di upload. Prima impostato
// a 60s, rivelatosi il vero tetto troppo basso: una riunione di ~20 min è
// rimasta bloccata per sempre su "in elaborazione" perché il lavoro in
// background veniva ucciso a metà, senza errore. Verificato nelle
// impostazioni Vercel del progetto (Settings → Functions) che il tetto
// reale del piano Hobby con Fluid Compute abilitato è oggi 300s, non 60s —
// 60 era una scelta prudente, non un limite di piattaforma. Da quando (vedi
// finalizeMeeting sotto) questo lavoro gira dopo la risposta al client via
// waitUntil(), questo tetto governa il budget del lavoro in background, non
// più il tempo che il client aspetta la risposta — vedi anche DEADLINE_MS
// lì sotto, che aborta esplicitamente prima di arrivare a questo limite
// invece di lasciare che Vercel uccida la funzione senza preavviso.
export const maxDuration = 300;

// Testo segnaposto salvato subito alla creazione, prima che
// trascrizione/riassunto siano pronti — vedi il commento sopra
// finalizeMeeting per il perché. MemoryCard.tsx mostra già la scritta
// "in elaborazione…" per status "processing", quindi questo testo resta
// visibile solo per una manciata di secondi/minuti nella maggior parte dei
// casi.
const PLACEHOLDER_CONTENT = "Trascrizione e riassunto in corso…";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2026-09-17: il body è ora JSON leggero ({ path, duration }), non più il
  // file. Il blob arriva su Storage caricato DIRETTAMENTE dal client (vedi
  // src/lib/uploadCapture.ts), proprio per non passare mai più da qui: il
  // tetto di 4.5MB imposto dalla piattaforma Vercel sul corpo delle
  // richieste alle funzioni serverless (non aggirabile da codice, vedi
  // https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE) rifiutava
  // qualunque riunione oltre ~18-19 minuti PRIMA ancora che questo codice
  // venisse eseguito — la causa reale del bug segnalato dall'utente
  // ("riunione mai caricata nonostante rete ok"), diagnosticata solo grazie
  // a UploadError.technicalDetail (vedi uploadCapture.ts).
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : null;
  const duration = Number(body?.duration ?? 0);
  if (!path) return NextResponse.json({ error: "no_file" }, { status: 400 });

  // Le policy RLS (008_storage.sql) impedirebbero comunque a un utente di
  // leggere il file di qualcun altro, ma controlliamo esplicitamente il
  // prefisso per restituire un errore chiaro invece di un fallimento di
  // download generico.
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();
  const tier = profile?.subscription_tier;

  // Da qui in poi, ogni uscita anticipata deve ripulire il file che il
  // client ha già caricato su Storage (fase 1 in uploadCapture.ts) prima di
  // chiamarci: non lo stiamo accettando, quindi non deve restare orfano.
  const cleanupUpload = () => supabase.storage.from("audio").remove([path]).catch(() => {});

  // Enforcement limite tier Free: 100 memorie/mese, condiviso tra tutti i
  // tipi — vedi src/lib/subscription/limits.ts.
  if (await isMemoryQuotaExceeded(supabase, user.id, tier)) {
    await cleanupUpload();
    return NextResponse.json({ error: "limit_reached", limit: FREE_MEMORIES_PER_MONTH }, { status: 402 });
  }

  // Tetto per singola registrazione: limite tecnico legato a Whisper, non
  // la leva di differenziazione free/premium.
  const maxSeconds = tier === "free" ? MAX_SECONDS_FREE : MAX_SECONDS_PAID;
  if (duration > maxSeconds) {
    await cleanupUpload();
    return NextResponse.json({ error: "duration_exceeded", max: maxSeconds }, { status: 402 });
  }

  // Monte ore mensile (audio + riunioni sommati) — vera leva di
  // differenziazione free/premium, ancorata al costo reale di Whisper
  // ($0,006/min) — vedi src/lib/subscription/limits.ts e BACKLOG.md.
  const minutesUsed = await transcriptionMinutesUsedThisMonth(supabase, user.id);
  const minutesQuota = transcriptionMinutesQuota(tier);
  if (limitsEnabled() && minutesUsed + duration / 60 > minutesQuota) {
    await cleanupUpload();
    return NextResponse.json(
      { error: "monthly_minutes_exceeded", max_minutes: minutesQuota, used_minutes: Math.round(minutesUsed) },
      { status: 402 }
    );
  }

  // Il file è già su Storage (caricato direttamente dal client — vedi
  // commento in cima alla funzione): lo scarichiamo qui per proseguire con
  // trascrizione e analisi. Questo è un fetch in USCITA verso Supabase, non
  // una richiesta in entrata verso di noi: nessun limite di piattaforma
  // Vercel si applica, qualunque sia la dimensione del file.
  const { data: downloaded, error: downloadError } = await supabase.storage.from("audio").download(path);
  if (downloadError || !downloaded) {
    // Non ripuliamo qui: se il file non è (ancora) su Storage non c'è nulla
    // da rimuovere, e potrebbe trattarsi di un ritardo di propagazione
    // transitorio — vale la pena ritentare (vedi uploadCapture.ts, che in
    // questo caso riparte dalla finalizzazione senza ricaricare il blob).
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  const buffer = Buffer.from(await downloaded.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) {
    await cleanupUpload();
    return NextResponse.json(
      { error: "file_too_large", max_mb: MAX_FILE_BYTES / (1024 * 1024) },
      { status: 413 }
    );
  }

  const { data: signedUrl } = await supabase.storage.from("audio").createSignedUrl(path, 60 * 60);

  // 2026-09-22: trascrizione Whisper + riassunto GPT (sotto, in
  // finalizeMeeting) su una riunione lunga possono da soli superare i 60s
  // massimi del piano Hobby di Vercel se eseguiti PRIMA di rispondere al
  // client — la funzione veniva uccisa a metà con un 504. uploadCapture.ts
  // non distingue questo da un errore transitorio e ritenta la
  // finalizzazione (fase 2, vedi lì), ma essendo lo STESSO lavoro sincrono
  // il risultato è identico a ogni tentativo: la riunione non si carica mai,
  // segnalato "Continua a fallire dopo 4 tentativi: HTTP 504: upload_failed"
  // (utente, 2026-09-22). Creiamo subito la memoria con un segnaposto e
  // rispondiamo: questo sblocca il client (la registrazione esce dalla coda
  // di upload) in pochi secondi, indipendentemente da quanto dura la
  // riunione. Trascrizione+analisi proseguono dopo, in background.
  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "meeting",
      status: "processing",
      title: `Riunione del ${new Date().toLocaleDateString("it-IT")}`,
      content: PLACEHOLDER_CONTENT,
      media_path: path,
      media_url: signedUrl?.signedUrl,
      media_size: buffer.length,
      media_duration: duration,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // waitUntil(): senza, la funzione serverless termina appena risposto e la
  // Promise di finalizeMeeting()/processMemory() viene uccisa a metà prima
  // di completare — è la causa esatta delle riunioni rimaste bloccate per
  // sempre su "in elaborazione" (segnalato dall'utente 2026-09-17,
  // riproducibile su qualunque memoria creata da questa route).
  waitUntil(
    finalizeMeeting(memory.id, buffer, duration)
      .then(() => processMemory(memory.id))
      .catch((err) => console.error("finalizeMeeting failed (riunione)", err))
  );

  // `detected` non è più disponibile subito (l'analisi è in background):
  // il frontend (MeetingRecorder.tsx) perde il toast immediato "Appuntamento
  // creato: ..." per questa route — la scadenza/appuntamento viene comunque
  // creata/o appena finalizeMeeting completa, semplicemente senza notifica
  // istantanea. Preferibile alla riunione che non si carica mai.
  return NextResponse.json({ ...memory, detected: null }, { status: 201 });
}

// Copia esplicita in un ArrayBuffer "piatto": il tipo di Buffer.buffer è
// ArrayBufferLike (può includere SharedArrayBuffer), che il DOM lib non
// accetta come BlobPart per File/Blob — vedi lo stesso helper in
// /api/upload/audio/route.ts.
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

// Trascrizione Whisper + riassunto/temi/mappa GPT + rilevamento
// scadenza/appuntamento per una riunione già salvata come memoria
// segnaposto (vedi POST sopra). Gira dentro waitUntil(), quindi DOPO che la
// risposta HTTP è già stata inviata al client: usiamo createServiceClient()
// invece del client legato ai cookie della richiesta (stesso motivo per cui
// processMemory() in classification.ts fa lo stesso — un client basato su
// cookie non è affidabile fuori dal ciclo di vita della richiesta che lo ha
// creato).
// Margine di sicurezza sotto maxDuration (300s, sopra): abortiamo NOI le
// chiamate a OpenAI (trascrizione + riassunto) prima che sia Vercel a
// uccidere l'intera funzione. Senza questo, una riunione troppo lunga per
// completare in tempo lasciava la memoria bloccata per sempre su "in
// elaborazione" (bug segnalato 2026-09-22) — con l'abort esplicito
// otteniamo invece un errore chiaro e immediato (vedi catch sotto), sempre,
// indipendentemente da quanto la registrazione superi il budget disponibile.
const DEADLINE_MS = 270_000;

// Esportata (2026-09-26) così /api/memories/[id]/retry/route.ts può
// richiamare esattamente la stessa logica su una riunione già salvata e
// finita in status "error" (es. per il vecchio tetto di 60s, poi alzato a
// 300s lo stesso giorno in cui questa specifica registrazione ha fallito) —
// senza retry, un fallimento restava bloccato per sempre finché non
// interveniva uno sviluppatore. Deroga deliberata alla convenzione di
// duplicare i piccoli helper per-route (vedi romeLocalToUtcIso sopra):
// duplicare qui l'intera pipeline Whisper+GPT (190+ righe) sarebbe stato un
// rischio di disallineamento futuro molto peggiore di un singolo import.
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
    throw err; // lascia loggare anche al chiamante (waitUntil in POST)
  } finally {
    clearTimeout(deadlineTimer);
  }
}
