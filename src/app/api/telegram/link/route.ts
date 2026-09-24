import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/noStore";

// Dati specifici dell'utente autenticato — non deve mai essere cacheabile
// da un CDN o dal browser (vedi noStoreJson).
export const dynamic = "force-dynamic";

// Senza caratteri ambigui (0/O, 1/I/L): il codice va letto e ricopiato a
// mano dall'utente dentro Telegram.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// Genera un codice monouso a breve scadenza che l'utente manda al bot
// Telegram con "/start <codice>" (vedi /api/telegram/webhook) per collegare
// quella chat al proprio account — stesso principio di un OTP, non
// riusiamo l'id utente direttamente per non esporlo in un link
// condivisibile o intercettabile.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({ telegram_link_code: code, telegram_link_code_expires_at: expiresAt })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Impostato una volta come env var quando si crea il bot con BotFather —
  // senza, mostriamo comunque il codice ma non possiamo costruire il link
  // diretto "apri Telegram".
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;

  return noStoreJson({
    code,
    expires_at: expiresAt,
    deep_link: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
  });
}
