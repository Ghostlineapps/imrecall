import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildMicrosoftAuthUrl } from "@/lib/microsoft/client";

// Stesso schema del collegamento Google (src/app/api/integrations/google/connect/route.ts):
// genera uno state anti-CSRF, lo salva in un cookie httpOnly di breve durata,
// e reindirizza alla pagina di consenso Microsoft.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const state = crypto.randomUUID();
  cookies().set("microsoft_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });

  return NextResponse.redirect(buildMicrosoftAuthUrl(state));
}
