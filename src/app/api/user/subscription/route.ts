import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// Disdetta/riattivazione abbonamento senza cancellare l'account — richiesta
// 2026-11-22. I Termini di Servizio promettono da tempo "puoi disdire in
// qualsiasi momento dalle Impostazioni: la disdetta evita il rinnovo
// successivo, ma resta attiva fino alla fine del periodo già pagato" (vedi
// src/app/terms/page.tsx), ma prima di questa route l'unico modo reale di
// fermare un rinnovo era cancellare l'intero account (src/app/api/user/account)
// o scrivere all'assistenza. Vedi anche migrazione 041.
//
// Usiamo cancel_at_period_end (non una cancellazione immediata): l'utente
// mantiene l'accesso Premium fino alla fine del periodo già pagato, esatto
// comportamento già promesso nei Termini — niente rimborso parziale da
// gestire, e Stripe chiude da solo l'abbonamento a scadenza (webhook
// "customer.subscription.deleted", vedi src/app/api/webhooks/stripe/route.ts).
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const cancelAtPeriodEnd = body?.cancel_at_period_end;
  if (typeof cancelAtPeriodEnd !== "boolean") {
    return NextResponse.json({ error: "cancel_at_period_end_required" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("subscription_tier, stripe_subscription_id")
    .eq("id", user.id)
    .single();

  // Il piano Founder è un pagamento unico (vedi src/lib/stripe/client.ts):
  // nessun abbonamento Stripe da disdire o riattivare.
  if (profile?.subscription_tier === "founder") {
    return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  }
  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  }

  try {
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });
  } catch (err) {
    console.error("Aggiornamento cancel_at_period_end su Stripe fallito:", err);
    return NextResponse.json({ error: "stripe_update_failed" }, { status: 500 });
  }

  // Scrittura ottimistica: non aspettiamo il webhook "customer.subscription.
  // updated" (che arriverà comunque e scriverà di nuovo lo stesso valore,
  // vedi commento lì) solo per non far percepire all'utente un ritardo tra
  // il click e quello che vede in Impostazioni.
  const { error } = await admin
    .from("profiles")
    .update({ cancel_at_period_end: cancelAtPeriodEnd })
    .eq("id", user.id);

  if (error) {
    console.error("Scrittura ottimistica cancel_at_period_end fallita:", error);
    // Non è un errore fatale: il webhook la correggerà comunque a breve.
  }

  return NextResponse.json({ ok: true, cancel_at_period_end: cancelAtPeriodEnd });
}
