import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchGoogleEmail, encryptToken } from "@/lib/google/client";

const STATE_COOKIE = "google_oauth_state";

function settingsUrl(status: "connected" | "error"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.imrecall.app";
  return `${base.replace(/\/$/, "")}/settings/integrations?google=${status}`;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "https://www.imrecall.app"));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = cookies().get(STATE_COOKIE)?.value;
  cookies().delete(STATE_COOKIE);

  // L'utente può anche aver semplicemente annullato il consenso su Google
  // (query "error=access_denied"): nessun errore reale, torniamo alle
  // Impostazioni senza fare rumore.
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(settingsUrl("error"));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Succede se l'utente aveva già autorizzato l'app in passato e Google
      // non ha riproposto lo schermo di consenso nonostante prompt=consent
      // (raro, ma possibile con account particolari) — senza refresh_token
      // non possiamo mantenere il collegamento attivo nel tempo.
      return NextResponse.redirect(settingsUrl("error"));
    }

    const googleEmail = await fetchGoogleEmail(tokens.access_token);
    const supabaseService = createServiceClient();

    await supabaseService.from("google_integrations").upsert({
      user_id: user.id,
      refresh_token: encryptToken(tokens.refresh_token),
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      google_email: googleEmail,
      scope: tokens.scope,
      // Processiamo solo le email arrivate DA QUESTO momento in poi: niente
      // scansione retroattiva della cronologia della casella, sia per
      // rispetto della privacy sia per evitare un'ondata di appuntamenti
      // vecchi al primo collegamento.
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(settingsUrl("connected"));
  } catch (err) {
    console.error("Google OAuth callback fallito", err);
    return NextResponse.redirect(settingsUrl("error"));
  }
}
