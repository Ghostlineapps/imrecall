// Template email di benvenuto per i Founder di IMRECALL (accesso Premium a
// vita, primi 50 sostenitori — vedi discussione 2026-08-27). Usato sia dal
// webhook Stripe (src/app/api/webhooks/stripe/route.ts, per gli acquisti
// reali) sia dalla route admin (src/app/api/admin/founder-welcome/route.ts,
// per i posti Founder assegnati manualmente, es. via SQL, che non passano
// mai dal webhook).
export const FOUNDER_WELCOME_SUBJECT = "Benvenuto/a tra i Founder di IMRECALL 🚀";

export function founderWelcomeEmailHtml(): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f2a3f;">
    <div style="background: linear-gradient(135deg, #2f8fd1, #1a5f96); border-radius: 16px; padding: 32px 28px; color: #ffffff;">
      <p style="margin: 0 0 4px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">IMRECALL Founder</p>
      <h1 style="margin: 0; font-size: 24px; line-height: 1.3;">Benvenuto/a tra i Founder di IMRECALL 🚀</h1>
    </div>
    <div style="padding: 28px 4px;">
      <p style="font-size: 15px; line-height: 1.6;">Complimenti, e grazie di cuore — sei ufficialmente tra i primi sostenitori di IMRECALL. Il tuo supporto fin dall'inizio conta più di quanto immagini.</p>
      <p style="font-size: 15px; line-height: 1.6;">Da oggi hai accesso <strong>Premium a vita</strong>, senza scadenze e senza nessun altro pagamento:</p>
      <ul style="font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
        <li>Memorie e trascrizioni illimitate, ogni mese</li>
        <li>Nessuna scadenza sui ricordi salvati</li>
        <li>Promemoria intelligenti su farmaci, scadenze e appuntamenti</li>
        <li>Integrazioni con Gmail e Outlook</li>
        <li>Consigli contestuali basati sugli spostamenti</li>
      </ul>
      <p style="font-size: 15px; line-height: 1.6;">Ti auguriamo di sfruttarla al massimo — la tua memoria, in orbita 🛰️</p>
      <a href="https://www.imrecall.app" style="display: inline-block; margin-top: 12px; background: #2f8fd1; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 999px; font-size: 15px; font-weight: 600;">Apri IMRECALL</a>
    </div>
  </div>
  `;
}
