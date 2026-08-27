import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripe, isValidPlan, priceIdForPlan, FOUNDER_SEATS_TOTAL, type PlanId } from "@/lib/stripe/client";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.imrecall.app").replace(/\/$/, "");
}

// Crea una Checkout Session Stripe per il piano scelto dall'utente
// (mensile/annuale ricorrenti, o Founder a pagamento unico — vedi
// src/lib/stripe/client.ts) e restituisce l'URL a cui il client deve
// reindirizzare. Il piano è passato come identificatore interno
// ("monthly"/"annual"/"founder"), non come Price ID: è la route, non il
// client, a sapere quale price_... di Stripe corrisponde a quale piano.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let plan: unknown;
  try {
    ({ plan } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!isValidPlan(plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, stripe_customer_id, subscription_tier")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

  // Chi è già Premium o Founder non deve poter ricomprare lo stesso
  // accesso — evita addebiti doppi da un doppio click o da una vecchia tab
  // riaperta sulla pagina Premium.
  if (profile.subscription_tier && profile.subscription_tier !== "free") {
    return NextResponse.json({ error: "already_premium" }, { status: 400 });
  }

  // Il piano Founder è limitato a FOUNDER_SEATS_TOTAL posti (vedi
  // discussione 2026-08-27): il conteggio va fatto con il service client
  // perché la RLS su profiles ("profiles_own", supabase/migrations/
  // 006_rls.sql) permette a ogni utente di leggere solo la propria riga,
  // non un conteggio su tutti gli utenti.
  if (plan === "founder") {
    const admin = createServiceClient();
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("subscription_tier", "founder");
    if ((count ?? 0) >= FOUNDER_SEATS_TOTAL) {
      return NextResponse.json({ error: "founder_sold_out" }, { status: 409 });
    }
  }

  const priceId = priceIdForPlan(plan as PlanId);
  const base = appUrl();
  const isFounder = plan === "founder";

  const session = await stripe.checkout.sessions.create({
    mode: isFounder ? "payment" : "subscription",
    customer: profile.stripe_customer_id ?? undefined,
    customer_email: profile.stripe_customer_id ? undefined : profile.email,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user.id, plan },
    subscription_data: isFounder ? undefined : { metadata: { user_id: user.id, plan } },
    success_url: `${base}/settings/premium?checkout=success`,
    cancel_url: `${base}/settings/premium?checkout=canceled`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "checkout_creation_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
