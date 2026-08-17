/**
 * Invio email transazionali via Resend (https://resend.com). Richiede
 * RESEND_API_KEY configurata; se assente l'invio viene saltato con un log,
 * senza bloccare il resto del flusso (stesso pattern del geocoding).
 *
 * Nota: senza un dominio verificato su Resend, il mittente di default
 * "onboarding@resend.dev" può inviare solo all'indirizzo email associato
 * all'account Resend stesso — sufficiente per un singolo utente, ma da
 * aggiornare con un dominio verificato quando IMRECALL avrà più utenti.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "IMRECALL <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn("RESEND_API_KEY non configurata: email saltata per", to);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      console.error("Invio email fallito", await res.text());
    }
  } catch (err) {
    console.error("Invio email fallito", err);
  }
}
