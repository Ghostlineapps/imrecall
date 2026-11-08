import { createServiceClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/google/tokenCrypto";
import { sendPushToUser } from "@/lib/push/server";

// Riusiamo la stessa chiave di cifratura (GOOGLE_TOKEN_ENCRYPTION_KEY) e le
// stesse funzioni encrypt/decrypt già usate per Gmail: è una cifratura
// AES-256-GCM generica, non specifica di Google — evita di dover generare e
// configurare un secondo secret su Vercel solo per questo.
export { encryptToken, decryptToken };

// "common" consente sia account Microsoft personali (Outlook.com/Hotmail)
// sia account aziendali/scolastici con lo stesso client — è la scelta giusta
// per un prodotto consumer come ImRecall.
const MICROSOFT_TENANT = "common";
const AUTH_BASE = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0`;

export const MICROSOFT_OAUTH_SCOPES = [
  "offline_access",
  "Mail.Read",
  "Calendars.ReadWrite",
  "User.Read",
].join(" ");

function redirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.imrecall.app";
  return `${base}/api/integrations/microsoft/callback`;
}

export function buildMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: MICROSOFT_OAUTH_SCOPES,
    state,
    prompt: "consent",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    scope: MICROSOFT_OAUTH_SCOPES,
  });

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Scambio codice Microsoft fallito: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }>;
}

async function refreshAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_OAUTH_SCOPES,
  });

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    // 2026-11-08: stesso principio applicato a Google dopo l'incidente
    // gmail-sync (vedi src/lib/google/client.ts) — qui il refresh tornava
    // semplicemente null su qualunque fallimento, senza distinguere un
    // errore transitorio da un token permanentemente invalido
    // (invalid_grant/AADSTS70008, es. consenso revocato dall'utente su
    // Microsoft). Propaghiamo il body così il chiamante può distinguere i
    // due casi invece di limitarsi a ritentare in silenzio ad ogni giro.
    throw new Error(`Refresh del token Microsoft fallito: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string; // Microsoft a volte restituisce un nuovo refresh token: va salvato se presente
    expires_in: number;
  }>;
}

export async function fetchMicrosoftEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.mail ?? data.userPrincipalName ?? null;
}

// Stessa logica di src/lib/google/client.ts: cache dell'access token in
// microsoft_integrations, rigenerato dal refresh token quando scaduto o
// mancante.
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: integration } = await supabase
    .from("microsoft_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!integration) return null;

  // Vedi commento gemello in src/lib/google/client.ts: se un giro
  // precedente ha già rilevato un fallimento permanente del refresh, non
  // ritentiamo ad ogni giro (fallirebbe di nuovo e rimanderebbe la push
  // ogni 5 minuti) — last_synced_at resta fermo all'ultimo sync riuscito,
  // punto da cui /api/integrations/microsoft/callback ripartirà per
  // recuperare quanto arrivato nel frattempo quando l'utente ricollega.
  if (integration.reauth_required) return null;

  const expiresAt = integration.access_token_expires_at
    ? new Date(integration.access_token_expires_at).getTime()
    : 0;

  if (integration.access_token && expiresAt > Date.now() + 60_000) {
    return integration.access_token;
  }

  const refreshToken = decryptToken(integration.refresh_token);

  let refreshed: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (err) {
    // Stesso trattamento del gemello Google: un fallimento permanente
    // (consenso revocato, refresh token scaduto) marca la riga invece di
    // ritentare in silenzio per sempre, e avvisa l'utente via push.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid_grant") || message.includes("AADSTS70008") || message.includes("AADSTS700082")) {
      await supabase.from("microsoft_integrations").update({ reauth_required: true }).eq("user_id", userId);
      await sendPushToUser(userId, {
        title: "Collegamento Outlook da rifare",
        body: "Il collegamento a Outlook non è più valido: riconnettilo da Impostazioni → Integrazioni per tornare a rilevare appuntamenti dalle email (recupereremo anche quelli arrivati nel frattempo).",
        url: "/settings/integrations",
      });
      return null;
    }
    throw err;
  }

  const updates: Record<string, unknown> = {
    access_token: refreshed.access_token,
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (refreshed.refresh_token) {
    updates.refresh_token = encryptToken(refreshed.refresh_token);
  }

  await supabase.from("microsoft_integrations").update(updates).eq("user_id", userId);

  return refreshed.access_token;
}
