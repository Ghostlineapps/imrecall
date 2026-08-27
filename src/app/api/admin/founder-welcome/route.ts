import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { FOUNDER_WELCOME_SUBJECT, founderWelcomeEmailHtml } from "@/lib/email/templates/founder-welcome";

// Route di servizio per (ri)inviare l'email di benvenuto Founder a un
// account specifico — pensata per i posti Founder assegnati manualmente
// (es. via SQL diretto su Supabase, non tramite Stripe, vedi discussione
// 2026-08-27): per quegli account il webhook Stripe non parte mai, quindi
// l'email automatica di checkout.session.completed (vedi
// src/app/api/webhooks/stripe/route.ts) non li raggiunge.
//
// Riusa CRON_SECRET come autenticazione invece di introdurre un nuovo
// segreto — stesso pattern già in uso per src/app/api/cron/*.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof email !== "string" || !email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, subscription_tier")
    .eq("email", email)
    .single();

  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  if (profile.subscription_tier !== "founder") {
    return NextResponse.json({ error: "not_founder" }, { status: 400 });
  }

  await sendEmail({
    to: profile.email,
    subject: FOUNDER_WELCOME_SUBJECT,
    html: founderWelcomeEmailHtml(),
  });

  return NextResponse.json({ sent: true });
}
