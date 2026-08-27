import Stripe from "stripe";

// Istanza condivisa del client Stripe — stessa convenzione dei client
// Google/Microsoft in src/lib/{google,microsoft}/client.ts.
//
// apiVersion fissato esplicitamente (a differenza del resto dei client
// dell'app): senza specificarlo, il pacchetto "stripe" usa di default la
// versione API bundlata al momento del rilascio del pacchetto (qui
// "2024-06-20"), che sul nostro account risulta troppo vecchia — Stripe
// rifiuta la creazione della Checkout Session con l'errore "Managed
// Payments is not supported on API version 2024-06-20" (riscontrato in
// produzione il 2026-08-27). Il cast "as any" serve solo ad aggirare il
// literal type dell'apiVersion imposto dalle definizioni TypeScript del
// pacchetto installato (che potrebbero non includere ancora questa
// versione più recente come opzione valida) — a runtime viene comunque
// inviata la stringa esatta indicata qui.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil" as any,
});

export type PlanId = "monthly" | "annual" | "founder";

// Posti totali per il piano Founder (pagamento unico, 249€, accesso
// Premium a vita) — vedi discussione 2026-08-27. Il conteggio di quanti
// sono già stati venduti va fatto a runtime (src/app/api/checkout/route.ts
// e src/app/api/user/usage/route.ts), non salvato qui: questa è solo la
// soglia.
export const FOUNDER_SEATS_TOTAL = 50;

const PRICE_ENV_KEYS: Record<PlanId, string> = {
  monthly: "STRIPE_PRICE_MONTHLY",
  annual: "STRIPE_PRICE_ANNUAL",
  founder: "STRIPE_PRICE_FOUNDER",
};

export function priceIdForPlan(plan: PlanId): string {
  const envKey = PRICE_ENV_KEYS[plan];
  const id = process.env[envKey];
  if (!id) throw new Error(`Variabile d'ambiente ${envKey} non configurata`);
  return id;
}

export function isValidPlan(value: unknown): value is PlanId {
  return value === "monthly" || value === "annual" || value === "founder";
}
