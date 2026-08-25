import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildGoogleAuthUrl } from "@/lib/google/client";

const STATE_COOKIE = "google_oauth_state";

// Punto di ingresso del pulsante "Connetti Gmail" in Impostazioni: verifica
// che l'utente sia loggato, genera uno state anti-CSRF (verificato poi in
// /api/integrations/google/callback) e reindirizza al consenso Google.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "https://www.imrecall.app"));
  }

  const state = crypto.randomBytes(24).toString("hex");
  cookies().set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minuti: tempo più che sufficiente per completare il consenso su Google
    path: "/",
  });

  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
