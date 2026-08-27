import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/server";

// Riceve gli eventi Stripe e aggiorna lo stato Premium/Founder su
// Supabase. Usa sempre il service client (mai quello legato alla sessione
// utente, vedi src/lib/supabase/server.ts): questa route non ha una
// sessione Supabase associata, è Stripe stesso a chiamarla da server a
// server, autenticata solo dalla firma nell'header "stripe-signature".
export async function POST(req: NextRequest) {
  // La verifica della firma richiede il corpo grezzo esatto inviato da
  // Stripe: le route handler dell'App Router non applicano un body parser
  // automatico come le vecchie API routes di pages/, quindi req.text() qui
  // restituisce già il body non modificato — nessuna config aggiuntiva
  // necessaria.
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Firma webhook Stripe non valida:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id;
      if (!userId) {
        console.error("checkout.session.completed senza client_reference_id/metadata.user_id:", session.id);
        break;
      }

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: "premium",
            subscription_status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId,
            subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Errore aggiornando profilo dopo checkout abbonamento:", error);
          return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
        }
      } else if (session.mode === "payment") {
        // Piano Founder: pagamento singolo, nessun abbonamento ricorrente
        // — subscription_ends_at resta null (nessuna scadenza).
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: "founder",
            subscription_status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: null,
            subscription_ends_at: null,
          })
          .eq("id", userId);

        if (error) {
          console.error("Errore aggiornando profilo dopo checkout Founder:", error);
          return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_status: subscription.status,
          subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
          // Se Stripe segna l'abbonamento come cancellato senza passare da
          // "customer.subscription.deleted" (es. cancel_at_period_end
          // arrivato a scadenza), il piano torna gratuito già qui.
          ...(subscription.status === "canceled" ? { subscription_tier: "free" } : {}),
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Errore aggiornando profilo su subscription.updated:", error);
        return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_tier: "free",
          subscription_status: "canceled",
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Errore aggiornando profilo su subscription.deleted:", error);
        return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
      }
      break;
    }

    default:
      // Altri eventi (es. invoice.payment_failed) non sono ancora gestiti
      // — ignorati esplicitamente, per rendere chiaro che è una scelta e
      // non una dimenticanza.
      break;
  }

  return NextResponse.json({ received: true });
}
