import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import { finalizeMeeting } from "@/lib/openai/finalizeMeeting";
import { waitUntil } from "@vercel/functions";
import {
  FREE_MEMORIES_PER_MONTH,
  isMemoryQuotaExceeded,
  limitsEnabled,
  transcriptionMinutesQuota,
  transcriptionMinutesUsedThisMonth,
} from "@/lib/subscription/limits";

// Tetto per singola riunione: 30 min Free, 50 min Premium.
// 2026-09-22: abbassato da 90 a 50 min dopo che una riunione di ~20 min è
// rimasta bloccata per sempre su "in elaborazione" — con maxDuration=60 (il
// valore di prima) il lavoro in background (Whisper + riassunto GPT, vedi
// finalizeMeeting in src/lib/openai/finalizeMeeting.ts) veniva ucciso a metà
// senza nemmeno un errore visibile. Verificato nelle impostazioni Vercel del
// progetto (Settings → Functions) che il vero tetto del piano Hobby con
// Fluid Compute abilitato è oggi 300s, non 60s. Alzato maxDuration di
// conseguenza (sotto) e aggiunto un abort esplicito (DEADLINE_MS, vedi
// finalizeMeeting.ts) con un margine di sicurezza sotto quel tetto. 50 min è
// la soglia che riteniamo ragionevolmente raggiungibile in quel budget
// (trascrizione + riassunto insieme); senza dati reali sul throughput di
// Whisper su file molto lunghi non possiamo garantirlo con certezza oltre
// questo — per una garanzia solida sull'intera durata originariamente
// promessa (90 min) andrebbe alzato il piano Vercel a Pro (maxDuration fino
// a 1800s in beta) o implementata la segmentazione audio lato client (non
// ancora fatta). Non più allineato 1:1 al monte ore mensile (60/600 min,
// vedi src/lib/subscription/limits.ts): quello resta la vera leva
// free/premium, questo è solo un tetto tecnico per riunione.
const MAX_SECONDS_FREE = 1800; // 30 min
const MAX_SECONDS_PAID = 3000; // 50 min

// Whisper accetta al massimo 25MB per file. MeetingRecorder.tsx forza
// esplicitamente un bitrate audio basso (32kbps, ok per il parlato) proprio
// per restare ben sotto questa soglia anche a 90 minuti (~21.6MB attesi);
// aggiungiamo comunque un controllo diretto sui byte come rete di sicurezza
// nel caso l'encoding reale (dipende da browser/microfono) sia più pesante
// del previsto.
const MAX_FILE_BYTES = 24 * 1024 * 1024;

// Le trascrizioni + il riassunto GPT su una riunione lunga possono richiedere
// più dei pochi secondi tipici delle altre route di upload. Prima impostato
// a 60s, rivelatosi il vero tetto troppo basso: una riunione di ~20 min è
// rimasta bloccata per sempre su "in elaborazione" perché il lavoro in
// background veniva ucciso a metà, senza errore. Verificato nelle
// impostazioni Vercel del progetto (Settings → Functions) che il tetto
// reale del piano Hobby con Fluid Compute abilitato è oggi 300s, non 60s —
// 60 era una scelta prudente, non un limite di piattaforma. Da quando (vedi
// finalizeMeeting.ts) questo lavoro gira dopo la risposta al client via
// waitUntil(), questo tetto governa il budget del lavoro in background, non
// più il tempo che il client aspetta la risposta — vedi anche DEADLINE_MS
// lì, che aborta esplicitamente prima di arrivare a questo limite invece di
// lasciare che Vercel uccida la funzione senza preavviso.
export const maxDuration = 300;

// Testo segnaposto salvato subito alla creazione, prima che
// trascrizione/riassunto siano pronti — vedi il commento sopra
// finalizeMeeting (src/lib/openai/finalizeMeeting.ts) per il perché.
// MemoryCard.tsx mostra già la scritta "in elaborazione…" per status
// "processing", quindi questo testo resta visibile solo per una manciata di
// secondi/minuti nella maggior parte dei casi.
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

  // 2026-09-22: trascrizione Whisper + riassunto GPT (finalizeMeeting.ts) su
  // una riunione lunga possono da soli superare i 60s massimi del piano
  // Hobby di Vercel se eseguiti PRIMA di rispondere al client — la funzione
  // veniva uccisa a metà con un 504. uploadCapture.ts non distingue questo
  // da un errore transitorio e ritenta la finalizzazione (fase 2, vedi lì),
  // ma essendo lo STESSO lavoro sincrono il risultato è identico a ogni
  // tentativo: la riunione non si carica mai, segnalato "Continua a fallire
  // dopo 4 tentativi: HTTP 504: upload_failed" (utente, 2026-09-22).
  // Creiamo subito la memoria con un segnaposto e rispondiamo: questo
  // sblocca il client (la registrazione esce dalla coda di upload) in
  // pochi secondi, indipendentemente da quanto dura la riunione.
  // Trascrizione+analisi proseguono dopo, in background.
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
