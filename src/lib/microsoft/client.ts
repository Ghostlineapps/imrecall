import { createServiceClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/google/tokenCrypto";

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

  if (!res.ok) return null;

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

  const expiresAt = integration.access_token_expires_at
    ? new Date(integration.access_token_expires_at).getTime()
    : 0;

  if (integration.access_token && expiresAt > Date.now() + 60_000) {
    return integration.access_token;
  }

  const refreshToken = decryptToken(integration.refresh_token);
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed) return null;

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
