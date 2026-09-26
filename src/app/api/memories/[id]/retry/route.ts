import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import { waitUntil } from "@vercel/functions";
import { finalizeMeeting } from "@/lib/openai/finalizeMeeting";
import { finalizeAudio } from "@/lib/openai/finalizeAudio";

// Stesso tetto delle route di upload originali (vedi i commenti lì): senza
// questo, waitUntil() sotto verrebbe ucciso dal tetto di default della
// piattaforma prima che Whisper/GPT abbiano finito.
export const maxDuration = 300;

// 2026-09-26: prima di questa route, una riunione o nota vocale finita in
// status "error" (es. per un tetto di tempo troppo basso, poi alzato — vedi
// finalizeMeeting/finalizeAudio) restava bloccata per sempre: nessun
// meccanismo permetteva di rielaborare l'audio già salvato senza intervento
// diretto sul database. Segnalato dall'utente su una riunione del
// 22/09/2026 rimasta ferma dopo un fallimento causato da un limite (60s) già
// corretto lo stesso giorno — l'audio stesso non era mai stato perso (resta
// su Storage, vedi media_path), solo la trascrizione/riassunto non erano mai
// stati ritentati.
//
// Riusa la stessa pipeline delle route di upload (finalizeMeeting /
// finalizeAudio, spostate in src/lib/openai/ perché Next.js non permette
// export extra da un file route.ts dell'App Router — la prima versione di
// questa route importava direttamente dalle route di upload e ha rotto il
// build in produzione, vedi i commenti in finalizeMeeting.ts/finalizeAudio.ts)
// invece di duplicarla: qui ripartiamo dal file già su Storage, senza
// richiedere un nuovo upload dal client.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: memory } = await supabase
    .from("memories")
    .select("id, user_id, type, status, media_path, media_duration")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!memory) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Ha senso ritentare solo audio/riunioni fallite: sono gli unici tipi con
  // una fase di trascrizione in background che può fallire per timeout/errore
  // (vedi finalizeMeeting/finalizeAudio) — altri tipi (testo, immagine, link,
  // documento) non hanno questo secondo passaggio asincrono.
  if (memory.type !== "meeting" && memory.type !== "audio") {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  if (memory.status !== "error") {
    return NextResponse.json({ error: "not_failed" }, { status: 400 });
  }
  if (!memory.media_path) {
    return NextResponse.json({ error: "no_media" }, { status: 400 });
  }

  const { data: downloaded, error: downloadError } = await supabase.storage
    .from("audio")
    .download(memory.media_path);
  if (downloadError || !downloaded) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  const buffer = Buffer.from(await downloaded.arrayBuffer());

  // Torna al segnaposto "in elaborazione" (stesso testo usato dalle route di
  // upload originali) così il frontend mostra di nuovo lo stato corretto
  // invece del vecchio messaggio d'errore mentre il nuovo tentativo è in
  // corso — vedi il polling già esistente in memory/[id]/page.tsx.
  await supabase
    .from("memories")
    .update({
      status: "processing",
      error_message: null,
      content: memory.type === "meeting" ? "Trascrizione e riassunto in corso…" : "Trascrizione in corso…",
    })
    .eq("id", memory.id);

  waitUntil(
    (memory.type === "meeting"
      ? finalizeMeeting(memory.id, buffer, memory.media_duration ?? 0)
      : finalizeAudio(memory.id, buffer)
    )
      .then(() => processMemory(memory.id))
      .catch((err) => console.error("retry: rielaborazione fallita", err))
  );

  return NextResponse.json({ success: true });
}
