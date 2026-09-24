import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { processMemory } from "@/lib/openai/classification";
import { waitUntil } from "@vercel/functions";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { FREE_MEMORIES_PER_MONTH, isMemoryQuotaExceeded, limitsEnabled } from "@/lib/subscription/limits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ServiceClient = ReturnType<typeof createServiceClient>;

// Canale di cattura a zero frizione via Telegram (testo + note vocali), in
// aggiunta all'app — vedi migration 038 per il collegamento chat↔account e
// /api/telegram/link per come si genera il codice. Chiamata da Telegram
// stesso (setWebhook), non da un client autenticato: l'autenticazione qui
// è il secret token impostato in fase di registrazione del webhook, non un
// cookie di sessione Supabase.
//
// Stesso motivo di /api/upload/audio per maxDuration=300: la trascrizione
// Whisper di una nota vocale (finalizeTelegramVoice sotto) può girare
// dentro questa stessa invocazione, dentro waitUntil() dopo aver già
// risposto 200 a Telegram.
export const maxDuration = 300;

const MAX_SECONDS_FREE = 1800; // 30 min — stesso tetto di /api/upload/audio
const MAX_SECONDS_PREMIUM = 3000; // 50 min
const MAX_FILE_BYTES = 24 * 1024 * 1024; // limite Whisper, stesso di /api/upload/audio
const WHISPER_DEADLINE_MS = 270_000; // margine sotto maxDuration, stesso principio di DEADLINE_MS in /api/upload/audio

type TelegramVoice = {
  file_id: string;
  duration: number;
  file_size?: number;
};

type TelegramMessage = {
  chat: { id: number };
  text?: string;
  voice?: TelegramVoice;
};

export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const message: TelegramMessage | undefined = update?.message;

  // Altri tipi di update (edited_message, callback_query, messaggi in
  // canali/gruppi senza chat privata, ecc.) — li ignoriamo, ma rispondiamo
  // comunque 200: un errore qui farebbe ritentare Telegram all'infinito lo
  // stesso update.
  if (!message?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const supabase = createServiceClient();
  const text = typeof message.text === "string" ? message.text.trim() : undefined;

  if (text?.startsWith("/start")) {
    await handleLinkCode(supabase, chatId, text.replace("/start", "").trim());
    return NextResponse.json({ ok: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, subscription_tier")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (!profile) {
    await sendTelegramMessage(
      chatId,
      'Questa chat non è ancora collegata a un account ImRecall. Genera un codice da Impostazioni → Integrazioni nell\'app e mandamelo con "/start <codice>".'
    );
    return NextResponse.json({ ok: true });
  }

  if (await isMemoryQuotaExceeded(supabase, profile.id, profile.subscription_tier)) {
    await sendTelegramMessage(
      chatId,
      `Hai raggiunto il limite di ${FREE_MEMORIES_PER_MONTH} ricordi questo mese sul piano Free.`
    );
    return NextResponse.json({ ok: true });
  }

  if (message.voice) {
    await handleVoice(supabase, profile, chatId, message.voice);
    return NextResponse.json({ ok: true });
  }

  if (text && text.length > 0) {
    await handleText(supabase, profile.id, chatId, text);
    return NextResponse.json({ ok: true });
  }

  // Foto, documenti, sticker ecc.: non ancora supportati (richiedono la
  // stessa pipeline di /api/upload/image e /api/upload/document, non
  // ancora collegata qui) — meglio dirlo chiaramente che ignorare in
  // silenzio.
  await sendTelegramMessage(
    chatId,
    "Per ora capisco solo messaggi di testo e note vocali — foto e documenti arrivano in un prossimo aggiornamento."
  );
  return NextResponse.json({ ok: true });
}

async function handleLinkCode(supabase: ServiceClient, chatId: number, code: string) {
  if (!code) {
    await sendTelegramMessage(
      chatId,
      'Ciao! Per collegarmi al tuo account ImRecall, genera un codice da Impostazioni → Integrazioni nell\'app e mandamelo con "/start <codice>".'
    );
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, telegram_link_code_expires_at")
    .eq("telegram_link_code", code.toUpperCase())
    .maybeSingle();

  if (!profile?.telegram_link_code_expires_at || new Date(profile.telegram_link_code_expires_at) < new Date()) {
    await sendTelegramMessage(chatId, "Codice non valido o scaduto. Genera un nuovo codice da Impostazioni → Integrazioni nell'app.");
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ telegram_chat_id: chatId, telegram_link_code: null, telegram_link_code_expires_at: null })
    .eq("id", profile.id);

  if (error) {
    // Violazione del vincolo unique su telegram_chat_id: questa chat è già
    // collegata a un altro account ImRecall.
    await sendTelegramMessage(chatId, "Questa chat Telegram è già collegata a un altro account ImRecall.");
    return;
  }

  await sendTelegramMessage(chatId, "Collegato! Da ora puoi mandarmi un messaggio di testo o una nota vocale e li salvo su ImRecall.");
}

async function handleText(supabase: ServiceClient, userId: string, chatId: number, text: string) {
  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: userId,
      type: "text",
      status: "processing",
      content: text,
      raw_content: text,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !memory) {
    console.error("Creazione memoria da Telegram (testo) fallita", error);
    await sendTelegramMessage(chatId, "Non sono riuscito a salvarlo, riprova tra poco.");
    return;
  }

  // Stesso motivo di waitUntil() in /api/memories: senza, la funzione
  // termina appena risposto a Telegram e la classificazione in background
  // viene uccisa a metà.
  waitUntil(processMemory(memory.id).catch((err) => console.error("processMemory (Telegram testo) fallita", err)));

  await sendTelegramMessage(chatId, "Salvato su ImRecall.");
}

async function handleVoice(
  supabase: ServiceClient,
  profile: { id: string; subscription_tier: string | null },
  chatId: number,
  voice: TelegramVoice
) {
  const duration = voice.duration ?? 0;
  const maxSeconds = profile.subscription_tier === "free" ? MAX_SECONDS_FREE : MAX_SECONDS_PREMIUM;

  if (limitsEnabled() && duration > maxSeconds) {
    await sendTelegramMessage(chatId, `Nota vocale troppo lunga per il tuo piano (max ${Math.round(maxSeconds / 60)} minuti).`);
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN non configurato: impossibile scaricare la nota vocale");
    return;
  }

  // Bot API Telegram: prima getFile per ottenere il percorso del file,
  // poi il download vero e proprio da un dominio diverso — due chiamate,
  // come documentato dall'API.
  const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${voice.file_id}`);
  const fileInfo = await fileInfoRes.json().catch(() => null);
  const filePath: string | undefined = fileInfo?.result?.file_path;

  if (!filePath) {
    console.error("Telegram getFile fallita", fileInfo);
    await sendTelegramMessage(chatId, "Non sono riuscito a scaricare la nota vocale, riprova.");
    return;
  }

  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  if (buffer.length > MAX_FILE_BYTES) {
    await sendTelegramMessage(chatId, "Nota vocale troppo pesante, riprova con una registrazione più corta.");
    return;
  }

  // Stesso bucket "audio" già usato da /api/upload/audio, così il ricordo
  // risultante è indistinguibile (stesso player, stesso dettaglio) da una
  // registrazione fatta nell'app.
  const storagePath = `${profile.id}/telegram-${Date.now()}.oga`;
  const { error: uploadError } = await supabase.storage.from("audio").upload(storagePath, buffer, {
    contentType: "audio/ogg",
  });

  if (uploadError) {
    console.error("Upload nota vocale Telegram fallito", uploadError);
    await sendTelegramMessage(chatId, "Non sono riuscito a salvare la nota vocale, riprova.");
    return;
  }

  const { data: memory, error } = await supabase
    .from("memories")
    .insert({
      user_id: profile.id,
      type: "audio",
      status: "processing",
      content: "Trascrizione in corso…",
      media_path: storagePath,
      media_size: buffer.length,
      media_duration: duration,
      memory_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !memory) {
    console.error("Creazione memoria da Telegram (nota vocale) fallita", error);
    await sendTelegramMessage(chatId, "Non sono riuscito a salvare la nota vocale, riprova.");
    return;
  }

  waitUntil(
    finalizeTelegramVoice(memory.id, buffer)
      .then(() => processMemory(memory.id))
      .catch((err) => console.error("finalizeTelegramVoice fallita", err))
  );

  await sendTelegramMessage(chatId, "Ricevuto, sto trascrivendo la nota vocale…");
}

// Stessa logica di finalizeAudio in /api/upload/audio/route.ts (Whisper +
// abort esplicito prima del tetto di maxDuration, per non restare mai
// bloccati per sempre su "in elaborazione"): duplicata qui invece che
// importata, dato che sono route Next.js separate — stesso principio di
// duplicazione già seguito altrove nel progetto (vedi romeLocalToUtcIso).
async function finalizeTelegramVoice(memoryId: string, buffer: Buffer) {
  const supabase = createServiceClient();

  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), WHISPER_DEADLINE_MS);

  try {
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);

    const transcription = await openai.audio.transcriptions.create(
      {
        file: new File([arrayBuffer], "voice.oga", { type: "audio/ogg" }),
        model: "whisper-1",
        language: "it",
      },
      { signal: deadline.signal }
    );

    await supabase.from("memories").update({ content: transcription.text }).eq("id", memoryId);
  } catch (err) {
    const timedOut = deadline.signal.aborted;
    console.error("finalizeTelegramVoice: trascrizione fallita", timedOut ? "(timeout)" : "", err);
    await supabase
      .from("memories")
      .update({
        status: "error",
        error_message: timedOut ? "processing_timeout" : err instanceof Error ? err.message : "unknown_error",
        content: timedOut
          ? "Nota vocale salvata, ma è troppo lunga per essere trascritta entro i limiti della piattaforma. Il file resta comunque ascoltabile dal dettaglio del ricordo."
          : "Nota vocale salvata, ma la trascrizione è fallita. Il file resta comunque ascoltabile dal dettaglio del ricordo.",
      })
      .eq("id", memoryId);
  } finally {
    clearTimeout(deadlineTimer);
  }
}
