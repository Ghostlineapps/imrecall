import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchMicrosoftEmail, encryptToken } from "@/lib/microsoft/client";

// Stesso schema del callback Google (src/app/api/integrations/google/callback/route.ts):
// verifica lo state anti-CSRF, scambia il code, richiede un refresh_token
// (senza non possiamo risincronizzare senza richiedere consenso ogni volta),
// e salva il collegamento cifrato in microsoft_integrations.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.imrecall.app";

  const savedState = cookies().get("microsoft_oauth_state")?.value;
  cookies().delete("microsoft_oauth_state");

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/settings/integrations?outlook=error`);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${appUrl}/settings/integrations?outlook=error`);
    }

    const email = await fetchMicrosoftEmail(tokens.access_token);

    const supabaseService = createServiceClient();

    // Vedi commento gemello in /api/integrations/google/callback: un
    // ricollegamento dopo un'interruzione (reauth_required true) riparte
    // da last_synced_at invece che da "adesso", per recuperare quanto
    // arrivato nel frattempo — con lo stesso tetto di sicurezza a 90 giorni.
    const { data: existing } = await supabaseService
      .from("microsoft_integrations")
      .select("last_synced_at, reauth_required")
      .eq("user_id", user.id)
      .maybeSingle();

    const MAX_RECOVERY_MS = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const previousSync = existing?.last_synced_at ? new Date(existing.last_synced_at).getTime() : null;
    const lastSyncedAt =
      existing?.reauth_required && previousSync
        ? new Date(Math.max(previousSync, now - MAX_RECOVERY_MS)).toISOString()
        : new Date(now).toISOString();

    await supabaseService.from("microsoft_integrations").upsert({
      user_id: user.id,
      refresh_token: encryptToken(tokens.refresh_token),
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      microsoft_email: email,
      scope: tokens.scope,
      last_synced_at: lastSyncedAt,
      reauth_required: false,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(`${appUrl}/settings/integrations?outlook=connected`);
  } catch (err) {
    console.error("Collegamento Microsoft fallito", err);
    return NextResponse.redirect(`${appUrl}/settings/integrations?outlook=error`);
  }
}
