import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { FOUNDER_WELCOME_SUBJECT, founderWelcomeEmailHtml } from "@/lib/email/templates/founder-welcome";
import { OWNER_WELCOME_SUBJECT, ownerWelcomeEmailHtml } from "@/lib/email/templates/owner-welcome";

// Route di servizio per (ri)inviare l'email di benvenuto (Founder oppure
// Owner) a un account specifico — pensata per gli account che non passano
// mai dal webhook Stripe: i posti Founder assegnati manualmente (es. via
// SQL diretto su Supabase, subscription_tier = "founder" senza
// stripe_customer_id) e gli owner del progetto (is_owner = true,
// subscription_tier = "premium" — vedi discussione 2026-08-27). Per
// entrambi i casi l'email automatica di checkout.session.completed (vedi
// src/app/api/webhooks/stripe/route.ts) non si attiva mai.
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
    .select("email, subscription_tier, is_owner")
    .eq("email", email)
    .single();

  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

  // Gli owner (i fondatori del progetto) ricevono un testo dedicato, non
  // quello "Founder" pensato per i primi sostenitori — vedi discussione
  // 2026-08-27.
  if (profile.is_owner) {
    await sendEmail({
      to: profile.email,
      subject: OWNER_WELCOME_SUBJECT,
      html: ownerWelcomeEmailHtml(),
    });
    return NextResponse.json({ sent: true, kind: "owner" });
  }

  if (profile.subscription_tier !== "founder") {
    return NextResponse.json({ error: "not_founder" }, { status: 400 });
  }

  await sendEmail({
    to: profile.email,
    subject: FOUNDER_WELCOME_SUBJECT,
    html: founderWelcomeEmailHtml(),
  });

  return NextResponse.json({ sent: true, kind: "founder" });
}
