import { encryptToken, decryptToken } from "./tokenCrypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/server";

// Scope minimi necessari: lettura Gmail (per rilevare le email di
// riunioni/videocall/prenotazioni) e scrittura eventi sul Calendar
// dell'utente (per creare l'evento gemello dell'appuntamento). Niente
// scope più ampi (no gmail.modify, no calendar pieno) — principio del
// minimo privilegio, e riduce anche la severità della revisione Google
// quando arriverà il momento di uscire dalla modalità "Testing".
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getRedirectUri(): string {
  // NEXT_PUBLIC_APP_URL va impostata su https://www.imrecall.app in
  // produzione (stesso dominio configurato come redirect URI autorizzato
  // nella console Google Cloud — deve combaciare esattamente).
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.imrecall.app";
  return `${base.replace(/\/$/, "")}/api/integrations/google/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES,
    access_type: "offline", // necessario per ottenere un refresh_token
    prompt: "consent", // forza il consenso ogni volta: senza, Google a volte omette il refresh_token se l'utente aveva già autorizzato l'app in passato
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Scambio codice OAuth fallito: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Refresh del token Google fallito: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.email ?? null;
}

/**
 * Restituisce un access token valido per l'utente, rigenerandolo dal
 * refresh token (cifrato) se quello in cache è scaduto o mancante.
 * Aggiorna la cache in DB così le chiamate successive nello stesso giro di
 * sync non devono rifare il round-trip di refresh.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: integration } = await supabase
    .from("google_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!integration) return null;

  const expiresAt = integration.access_token_expires_at ? new Date(integration.access_token_expires_at) : null;
  const stillValid = expiresAt && expiresAt.getTime() - Date.now() > 60_000; // margine di 1 minuto

  if (integration.access_token && stillValid) {
    return integration.access_token;
  }

  const refreshToken = decryptToken(integration.refresh_token);

  let refreshed: TokenResponse;
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (err) {
    // 2026-11-08: scoperto perché l'utente ha segnalato che le conferme
    // prenotazione (volo+hotel per Berlino) non generavano l'appuntamento.
    // Causa: il refresh token può diventare permanentemente invalido —
    // Google risponde "invalid_grant" — tipicamente perché l'app Google è
    // ancora in modalità "Testing" sulla Console (vedi BACKLOG.md), dove i
    // refresh token scadono dopo ~7 giorni, oppure perché l'utente ha
    // revocato l'accesso da Google. Prima di questo fix il sync falliva
    // così ogni 5 minuti all'infinito con un solo console.error — per
    // questo utente dal 2026-09-01 (7 giorni esatti dopo il collegamento)
    // fino ad oggi, ~2 mesi, senza che nessuno se ne accorgesse: la UI in
    // Impostazioni continuava comunque a mostrare "Collegato" perché
    // /api/integrations/google/status controlla solo che la riga esista,
    // non che il token funzioni ancora. Qui invece, quando il fallimento è
    // di questo tipo (permanente, non un errore di rete transitorio),
    // rimuoviamo subito il collegamento — così la UI torna a mostrare
    // "Connetti Gmail" invece di uno stato falso — e avvisiamo l'utente via
    // push per invitarlo a ricollegare, invece di ritentare in silenzio.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid_grant")) {
      await supabase.from("google_integrations").delete().eq("user_id", userId);
      await sendPushToUser(userId, {
        title: "Collegamento Gmail da rifare",
        body: "Il collegamento a Gmail non è più valido: riconnettilo da Impostazioni → Integrazioni per tornare a rilevare appuntamenti dalle email.",
        url: "/settings/integrations",
      });
      return null;
    }
    throw err;
  }

  await supabase
    .from("google_integrations")
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return refreshed.access_token;
}

export async function revokeGoogleToken(refreshToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => {
    // best-effort: se la revoca fallisce (es. token già invalido) procediamo
    // comunque a cancellare il collegamento lato nostro
  });
}

export { encryptToken, decryptToken };
