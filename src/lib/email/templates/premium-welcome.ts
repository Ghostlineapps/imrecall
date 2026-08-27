// Template email di benvenuto per chi si abbona a IMRECALL Premium
// (mensile/annuale, ricorrente — vedi discussione 2026-08-27). A differenza
// di Founder e Owner, qui non c'è nessun riferimento a "primi sostenitori"
// o "fondatori": è solo un ringraziamento diretto per l'abbonamento.
// Inviata da src/app/api/webhooks/stripe/route.ts su
// checkout.session.completed con session.mode === "subscription".
export const PREMIUM_WELCOME_SUBJECT = "Benvenuto/a in IMRECALL Premium 🎉";

export function premiumWelcomeEmailHtml(): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f2a3f;">
    <div style="background: linear-gradient(135deg, #2f8fd1, #1a5f96); border-radius: 16px; padding: 32px 28px; color: #ffffff;">
      <p style="margin: 0 0 4px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">IMRECALL Premium</p>
      <h1 style="margin: 0; font-size: 24px; line-height: 1.3;">Benvenuto/a in IMRECALL Premium 🎉</h1>
    </div>
    <div style="padding: 28px 4px;">
      <p style="font-size: 15px; line-height: 1.6;">Il tuo abbonamento Premium è attivo. Da ora hai accesso a tutto quello che l'app può fare:</p>
      <ul style="font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
        <li>Memorie e trascrizioni illimitate, ogni mese</li>
        <li>Nessuna scadenza sui ricordi salvati</li>
        <li>Promemoria intelligenti su farmaci, scadenze e appuntamenti</li>
        <li>Integrazioni con Gmail e Outlook</li>
        <li>Consigli contestuali basati sugli spostamenti</li>
      </ul>
      <p style="font-size: 15px; line-height: 1.6;">Puoi gestire il tuo abbonamento — rinnovo, fatturazione o cancellazione — in qualsiasi momento dalle impostazioni.</p>
      <a href="https://www.imrecall.app" style="display: inline-block; margin-top: 12px; background: #2f8fd1; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 999px; font-size: 15px; font-weight: 600;">Apri IMRECALL</a>
    </div>
  </div>
  `;
}
