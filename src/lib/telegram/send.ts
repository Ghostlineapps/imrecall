/**
 * Invio messaggi via Telegram Bot API. Richiede TELEGRAM_BOT_TOKEN
 * configurato; se assente l'invio viene saltato con un log, senza bloccare
 * il resto del flusso — stesso pattern di sendEmail (src/lib/email/resend.ts).
 */
export async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN non configurato: messaggio Telegram saltato per", chatId);
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!res.ok) {
      console.error("Invio messaggio Telegram fallito", await res.text());
    }
  } catch (err) {
    console.error("Invio messaggio Telegram fallito", err);
  }
}
