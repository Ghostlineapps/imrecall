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

// Limite durata per tier: 30 min Free, 50 min Premium.
// 2026-09-22: abbassato da 100 a 50 min dopo che una riunione di soli ~20
// min è rimasta bloccata per sempre su "in elaborazione" (vedi finalizeAudio
// sotto e lo stesso fix, più esteso, in /api/upload/meeting/route.ts): con
// maxDuration=60 il lavoro in background (Whisper) veniva ucciso a metà.
// Ora maxDuration è a 300s (il vero tetto del piano Hobby con Fluid Compute
// — verificato nelle impostazioni Vercel del progetto, non più 60s) e
// finalizeAudio aborta esplicitamente la chiamata Whisper con un margine di
// sicurezza (DEADLINE_MS) scrivendo un errore chiaro invece di restare
// bloccata per sempre. 50 min è la soglia che riteniamo ragionevolmente
// raggiungibile entro quel budget; senza dati reali sul throughput di
// Whisper per file molto lunghi non possiamo garantirlo con certezza oltre
// questo — per una garanzia solida andrebbe o alzato il piano Vercel a Pro
// (maxDuration fino a 1800s) o implementata la segmentazione audio lato
// client (non ancora fatta).
const MAX_SECONDS_FREE = 1800; // 30 min
const MAX_SECONDS_PREMIUM = 3000; // 50 min

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

// 2026-09-22: prima questa route non dichiarava maxDuration, quindi usava il
// tetto di default della piattaforma — una nota vocale abbastanza lunga
// poteva far scadere la funzione a metà della trascrizione Whisper con un
// 504, prima ancora di scrivere la memoria. Poi impostato a 60s (stesso
// fix, più esteso, in /api/upload/meeting/route.ts), ma si è rivelato
// insufficiente: una registrazione da ~20 min è rimasta bloccata per sempre
// su "in elaborazione" perché il lavoro in background veniva ucciso a metà
// trascrizione, senza nemmeno un errore visibile. Verificato nelle
// impostazioni Vercel del progetto (Settings → Functions) che il vero tetto
// del piano Hobby con Fluid Compute abilitato è oggi 300s, non 60s — 60 era
// un valore scelto per prudenza, non il limite reale della piattaforma.
// La trascrizione gira in background (finalizeAudio, sotto) via waitUntil()
// dopo aver già risposto al client, quindi questo tetto governa solo il
// budget del lavoro in background — vedi anche DEADLINE_MS lì sotto, che
// aborta esplicitamente prima di arrivare a questo limite invece di lasciare
// che Vercel uccida la funzione senza preavviso.
export const maxDuration = 300;

// Testo segnaposto salvato subito alla creazione, prima che la trascrizione
// sia pronta — vedi finalizeAudio sotto. MemoryCard.tsx mostra già la
// scritta "in elaborazione…" per status "processing".
const PLACEHOLDER_CONTENT = "Trascrizione in corso…";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2026-09-17: il body è ora JSON leggero ({ path, duration }), non più il
  // file — vedi il commento equivalente (più esteso) in
  // /api/upload/meeting/route.ts sul perché: il tetto di 4.5MB sul corpo
  // delle richieste imposto dalla piattaforma Vercel sulle funzioni
  // serverless rifiutava qui gli upload più lunghi prima ancora che questo
  // codice venisse eseguito. Il blob arriva ora direttamente dal client a
  // Supabase Storage (vedi src/lib/uploadCapture.ts).
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : null;
  const duration = Number(body?.duration ?? 0);

  if (!path) return NextResponse.json({ error: "no_file" }, { status: 400 });

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
  // client ha già caricato su Storage prima di chiamarci — vedi lo stesso
  // pattern in /api/upload/meeting/route.ts.
  const cleanupUpload = () => supabase.storage.from("audio").remove([path]).catch(() => {});

  // Enforcement limite tier Free: 100 memorie/mese, condiviso tra tutti i
  // tipi — vedi src/lib/subscription/limits.ts.
  if (await isMemoryQuotaExceeded(supabase, user.id, tier)) {
    await cleanupUpload();
    return NextResponse.json({ error: "limit_reached", limit: FREE_MEMORIES_PER_MONTH }, { status: 402 });
  }

  // Tetto per singola registrazione: limite tecnico legato a Whisper (vedi
  // MAX_FILE_BYTES sotto), non la leva di differenziazione free/premium.
  const maxSeconds = tier === "free" ? MAX_SECONDS_FREE : MAX_SECONDS_PREMIUM;
  if (duration > maxSeconds) {
    await cleanupUpload();
    return NextResponse.json({ error: "duration_exceeded", max: maxSeconds }, { status: 402 });
  }

  // Monte ore mensile (audio + riunioni sommati): questa sì è la vera leva
  // di differenziazione free/premium, ancorata al costo reale di Whisper
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

  // Il file è già su Storage (caricato direttamente dal client): lo
  // scarichiamo qui per proseguire — fetch in USCITA verso Supabase, quindi
  // nessun limite di piattaforma Vercel si applica.
  const { data: downloaded, error: downloadError } = await supabase.storage.from("audio").download(path);
  if (downloadError || !downloaded) {
    // Non ripuliamo: il file potrebbe non essere ancora propagato su
    // Storage (transitorio) — vale la pena ritentare la sola finalizzazione.
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

  // 2026-09-22: la trascrizione Whisper (sotto, in finalizeAudio) può da
  // sola superare il tetto della funzione se eseguita PRIMA di rispondere al
  // client — stesso identico bug, e stessa soluzione, di
  // /api/upload/meeting/route.ts: creiamo subito la memoria con un
  // segnaposto e rispondiamo, la trascrizione prosegue dopo in background.
  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      type: "audio",
      status: "processing",
      content: PLACEHOLDER_CONTENT,
      media_path: path,
      media_size: buffer.length,
      media_duration: duration,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // waitUntil(): senza, la funzione serverless termina appena risposto e la
  // Promise di finalizeAudio()/processMemory() viene uccisa a metà — è la
  // causa esatta delle memorie rimaste bloccate per sempre su status
  // "processing" (vedi commento 2026-09-17 in src/app/api/memories/route.ts,
  // dove il problema era già stato segnalato come TODO ma mai risolto).
  waitUntil(
    finalizeAudio(memory.id, buffer)
      .then(() => processMemory(memory.id))
      .catch((err) => console.error("finalizeAudio failed", err))
  );

  return NextResponse.json(memory, { status: 201 });
}

// Copia esplicita in un ArrayBuffer "piatto": il tipo di Buffer.buffer è
// ArrayBufferLike (può includere SharedArrayBuffer), che il DOM lib non
// accetta come BlobPart per File/Blob — vedi lo stesso helper in
// /api/upload/meeting/route.ts.
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

// Trascrizione Whisper per una nota vocale già salvata come memoria
// segnaposto (vedi POST sopra). Gira dentro waitUntil(), quindi DOPO che la
// risposta HTTP è già stata inviata al client: usiamo createServiceClient()
// invece del client legato ai cookie della richiesta — stesso motivo
// spiegato in /api/upload/meeting/route.ts (finalizeMeeting) e in
// processMemory() (classification.ts).
// Margine di sicurezza sotto maxDuration (300s, sopra): abortiamo NOI la
// chiamata Whisper prima che sia Vercel a uccidere l'intera funzione. Senza
// questo, un file troppo lungo per completare in tempo lasciava la memoria
// bloccata per sempre su "in elaborazione" (bug segnalato 2026-09-22) — con
// l'abort esplicito otteniamo invece un errore chiaro e immediato (vedi
// catch sotto), sempre, indipendentemente da quanto la registrazione superi
// il budget disponibile.
const DEADLINE_MS = 270_000;

async function finalizeAudio(memoryId: string, buffer: Buffer) {
  const supabase = createServiceClient();

  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), DEADLINE_MS);

  try {
    const transcription = await openai.audio.transcriptions.create(
      {
        file: new File([bufferToArrayBuffer(buffer)], "recording.webm", { type: "audio/webm" }),
        model: "whisper-1",
        language: "it",
      },
      { signal: deadline.signal }
    );

    await supabase.from("memories").update({ content: transcription.text }).eq("id", memoryId);
  } catch (err) {
    // La memoria non deve restare bloccata per sempre su "in elaborazione"
    // con il testo segnaposto se Whisper fallisce (o se abbiamo dovuto
    // abortire per il timeout, vedi DEADLINE_MS sopra). Il file audio resta
    // comunque ascoltabile: non lo rimuoviamo.
    const timedOut = deadline.signal.aborted;
    console.error("finalizeAudio: trascrizione fallita", timedOut ? "(timeout)" : "", err);
    await supabase
      .from("memories")
      .update({
        status: "error",
        error_message: timedOut ? "processing_timeout" : err instanceof Error ? err.message : "unknown_error",
        content: timedOut
          ? "Registrazione salvata, ma è troppo lunga per essere trascritta entro i limiti della piattaforma. Prova con una registrazione più breve. Il file resta comunque ascoltabile dal dettaglio del ricordo."
          : "Registrazione salvata, ma la trascrizione è fallita. Il file resta comunque ascoltabile dal dettaglio del ricordo.",
      })
      .eq("id", memoryId);
    throw err;
  } finally {
    clearTimeout(deadlineTimer);
  }
}
