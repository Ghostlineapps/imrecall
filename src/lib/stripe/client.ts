import Stripe from "stripe";

// Istanza condivisa del client Stripe — stessa convenzione dei client
// Google/Microsoft in src/lib/{google,microsoft}/client.ts. Nessun
// apiVersion fissato esplicitamente: usa quello di default dell'account
// Stripe, evitando di doverlo tenere sincronizzato a mano con la versione
// del pacchetto "stripe" installata.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
