import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";

// 2026-09-26: spostata qui da /api/upload/audio/route.ts per lo stesso
// motivo di finalizeMeeting.ts (vedi commento lì): Next.js valida gli
// export di un file route.ts dell'App Router e rifiuta qualunque export
// oltre ai metodi HTTP e alle opzioni di route segment — esportare
// `finalizeAudio` direttamente dalla route ha rotto il deploy in
// produzione con un errore di build.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Copia esplicita in un ArrayBuffer "piatto": il tipo di Buffer.buffer è
// ArrayBufferLike (può includere SharedArrayBuffer), che il DOM lib non
// accetta come BlobPart per File/Blob — vedi lo stesso helper in
// finalizeMeeting.ts.
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

// Margine di sicurezza sotto maxDuration (300s, nei due chiamanti —
// /api/upload/audio/route.ts e /api/memories/[id]/retry/route.ts):
// abortiamo NOI la chiamata Whisper prima che sia Vercel a uccidere
// l'intera funzione. Senza questo, un file troppo lungo per completare in
// tempo lasciava la memoria bloccata per sempre su "in elaborazione" (bug
// segnalato 2026-09-22) — con l'abort esplicito otteniamo invece un errore
// chiaro e immediato (vedi catch sotto), sempre, indipendentemente da
// quanto la registrazione superi il budget disponibile.
const DEADLINE_MS = 270_000;

// Trascrizione Whisper per una nota vocale già salvata come memoria
// segnaposto. Chiamata da due punti: dopo l'upload iniziale
// (/api/upload/audio/route.ts) e da un nuovo tentativo su una nota vocale
// già fallita (/api/memories/[id]/retry/route.ts, aggiunta 2026-09-26).
// Gira dentro waitUntil() in entrambi i casi, quindi DOPO che la risposta
// HTTP è già stata inviata al client: usiamo createServiceClient() invece
// del client legato ai cookie della richiesta — stesso motivo spiegato in
// finalizeMeeting.ts e in processMemory() (classification.ts).
export async function finalizeAudio(memoryId: string, buffer: Buffer) {
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
