// Template email di benvenuto per gli "owner" di IMRECALL — i fondatori del
// progetto (vedi discussione 2026-08-27): accesso Premium a vita come i
// Founder, ma modellati separatamente su profiles (subscription_tier =
// "premium" + is_owner = true, non "founder") perché non sono "primi
// sostenitori" ma i creatori dell'app. Usato da
// src/app/api/admin/founder-welcome/route.ts.
export const OWNER_WELCOME_SUBJECT = "IMRECALL esiste perché anche tu l'hai voluto 🛰️";

export function ownerWelcomeEmailHtml(): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f2a3f;">
    <div style="background: linear-gradient(135deg, #2f8fd1, #1a5f96); border-radius: 16px; padding: 32px 28px; color: #ffffff;">
      <p style="margin: 0 0 4px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">IMRECALL Owner</p>
      <h1 style="margin: 0; font-size: 24px; line-height: 1.3;">IMRECALL esiste perché anche tu l'hai voluto 🛰️</h1>
    </div>
    <div style="padding: 28px 4px;">
      <p style="font-size: 15px; line-height: 1.6;">Quello che stai per aprire non è un abbonamento: è il progetto che avete creato dal nulla.</p>
      <p style="font-size: 15px; line-height: 1.6;">Da oggi il tuo accesso è <strong>Premium, per sempre</strong> — senza scadenze, senza rinnovi, senza pensieri. Non perché te lo sei guadagnato con un acquisto, ma perché IMRECALL esiste anche grazie al tuo contributo.</p>
      <p style="font-size: 15px; line-height: 1.6;">Hai accesso a tutto quello che l'app può fare:</p>
      <ul style="font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
        <li>Memorie e trascrizioni illimitate, ogni mese</li>
        <li>Nessuna scadenza sui ricordi salvati</li>
        <li>Promemoria intelligenti su farmaci, scadenze e appuntamenti</li>
        <li>Integrazioni con Gmail e Outlook</li>
        <li>Consigli contestuali basati sugli spostamenti</li>
      </ul>
      <p style="font-size: 15px; line-height: 1.6;">Ogni memoria che un utente salverà da oggi in poi porterà anche un po' della tua.</p>
      <p style="font-size: 15px; line-height: 1.6; font-style: italic;">La tua memoria, in orbita 🛰️</p>
      <a href="https://www.imrecall.app" style="display: inline-block; margin-top: 12px; background: #2f8fd1; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 999px; font-size: 15px; font-weight: 600;">Apri IMRECALL</a>
    </div>
  </div>
  `;
}
