"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Sparkles, Check, Infinity as InfinityIcon, Mail, Crown, Star } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Pagina Premium: vetrina + checkout reale (Stripe collegato dal
 * 2026-08-27, vedi src/app/api/checkout/route.ts e
 * src/app/api/webhooks/stripe/route.ts). Gli account attivati prima di
 * questa data restano Premium a vita indipendentemente da questa pagina.
 */

const CONFRONTO = [
  { voce: "Memorie al mese", free: "100", premium: "Illimitate" },
  { voce: "Minuti di trascrizione al mese", free: "60", premium: "600" },
  { voce: "Durata max. di una registrazione audio", free: "30 min", premium: "100 min" },
  { voce: "Durata max. di una riunione registrata", free: "30 min", premium: "90 min" },
  { voce: "Documenti al mese", free: "5", premium: "Illimitati" },
];

type Plan = "monthly" | "annual" | "founder";

function PremiumContent() {
  const { data, mutate } = useSWR("/api/user/usage", fetcher);
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get("checkout"); // "success" | "canceled" | null

  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tier = data?.subscription_tier;
  const isPremium = tier === "premium";
  const isFounder = tier === "founder";
  const hasAccess = isPremium || isFounder;
  const founderSeatsRemaining = data?.founder_seats_remaining as number | undefined;
  const founderSoldOut = founderSeatsRemaining === 0;

  async function startCheckout(plan: Plan) {
    setError(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "founder_sold_out") {
          setError("I posti Founder sono esauriti.");
        } else if (body.error === "already_premium") {
          setError("Il tuo account è già Premium.");
          mutate();
        } else {
          setError("Non siamo riusciti ad avviare il pagamento. Riprova tra poco.");
        }
        setLoadingPlan(null);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Non siamo riusciti ad avviare il pagamento. Riprova tra poco.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <div className="space-y-2">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-celeste-accent to-celeste-accentDark flex items-center justify-center text-white shadow-md shadow-celeste-navy/15">
          <Sparkles size={20} />
        </div>
        <h1 className="text-xl font-semibold">IMRECALL Premium</h1>
        <p className="text-sm text-celeste-muted">
          Più spazio per i ricordi, trascrizioni più lunghe, nessun limite mensile.
        </p>
      </div>

      {checkoutStatus === "success" && (
        <div className="card-light bg-celeste-accent/10 border-celeste-accent/20 text-sm">
          Pagamento completato — il tuo accesso Premium è attivo.
        </div>
      )}
      {checkoutStatus === "canceled" && (
        <div className="card-light text-sm text-celeste-muted">
          Pagamento annullato, nessun addebito effettuato.
        </div>
      )}

      {isFounder && (
        <div className="card-light flex items-center gap-3 bg-gradient-to-br from-celeste-accent/10 to-celeste-accentDark/10 border-celeste-accent/20">
          <div className="w-9 h-9 rounded-full bg-celeste-accent/15 flex items-center justify-center text-celeste-accentDark shrink-0">
            <Star size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Sei un Founder di IMRecall</p>
            <p className="text-xs text-celeste-muted mt-0.5">
              Accesso Premium a vita, uno dei primi 50 sostenitori del progetto.
            </p>
          </div>
        </div>
      )}

      {isPremium && (
        <div className="card-light flex items-center gap-3 bg-gradient-to-br from-celeste-accent/10 to-celeste-accentDark/10 border-celeste-accent/20">
          <div className="w-9 h-9 rounded-full bg-celeste-accent/15 flex items-center justify-center text-celeste-accentDark shrink-0">
            <Crown size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Il tuo account è già Premium</p>
            <p className="text-xs text-celeste-muted mt-0.5">
              Grazie per il supporto — hai già accesso a tutti i vantaggi qui sotto.
            </p>
          </div>
        </div>
      )}

      {!hasAccess && (
        <div className="card-light space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                billing === "monthly" ? "bg-celeste-accent text-white" : "text-celeste-muted"
              }`}
            >
              Mensile
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                billing === "annual" ? "bg-celeste-accent text-white" : "text-celeste-muted"
              }`}
            >
              Annuale
            </button>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold">{billing === "monthly" ? "11,99€" : "119€"}</span>
            <span className="text-sm text-celeste-muted">{billing === "monthly" ? "/mese" : "/anno"}</span>
          </div>
          {billing === "annual" && (
            <p className="text-xs text-celeste-muted -mt-2">Equivalente a circa 9,92€/mese</p>
          )}

          <button
            onClick={() => startCheckout(billing)}
            disabled={loadingPlan !== null}
            className="btn-primary-light w-full"
          >
            {loadingPlan === billing ? "Un attimo…" : "Passa a Premium"}
          </button>
        </div>
      )}

      {!isFounder && (
        <div className="card-light space-y-3 border-celeste-accentDark/20">
          <div className="flex items-center gap-2">
            <Star size={18} className="text-celeste-accentDark" />
            <p className="font-medium">IMRecall Founder</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold">249€</span>
            <span className="text-sm text-celeste-muted">una tantum, a vita</span>
          </div>
          <p className="text-xs text-celeste-muted">
            Accesso Premium per sempre, nessun addebito ricorrente. Riservato ai primi 50
            sostenitori.
            {typeof founderSeatsRemaining === "number" &&
              !founderSoldOut &&
              ` Ne restano ${founderSeatsRemaining}.`}
          </p>
          <button
            onClick={() => startCheckout("founder")}
            disabled={loadingPlan !== null || founderSoldOut}
            className="btn-ghost-light w-full border border-celeste-accentDark/30"
          >
            {founderSoldOut
              ? "Posti esauriti"
              : loadingPlan === "founder"
                ? "Un attimo…"
                : "Diventa Founder"}
          </button>
        </div>
      )}

      {error && <p className="text-urgent text-sm text-center">{error}</p>}

      <div className="space-y-2">
        <p className="font-medium px-1">Cosa cambia rispetto al piano gratuito</p>

        <div className="card-light overflow-hidden p-0">
          <div className="grid grid-cols-[1fr,auto,auto] text-xs text-celeste-muted border-b border-celeste-navy/5 px-4 py-2">
            <span></span>
            <span className="text-center w-16">Free</span>
            <span className="text-center w-20">Premium</span>
          </div>
          {CONFRONTO.map((riga, i) => (
            <div
              key={riga.voce}
              className={`grid grid-cols-[1fr,auto,auto] items-center px-4 py-3 text-sm ${
                i > 0 ? "border-t border-celeste-navy/5" : ""
              }`}
            >
              <span>{riga.voce}</span>
              <span className="text-center w-16 text-celeste-muted">{riga.free}</span>
              <span className="text-center w-20 font-medium text-celeste-accentDark">{riga.premium}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium px-1">Integrazioni email</p>

        <div className="card-light flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-celeste-accent/10 flex items-center justify-center text-celeste-accentDark shrink-0">
            <Mail size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Gmail</p>
            <p className="text-xs text-celeste-muted mt-0.5">
              Rilevamento automatico di appuntamenti e riunioni dalle email, con evento gemello su
              Google Calendar. Attiva.
            </p>
          </div>
        </div>

        <div className="card-light flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-celeste-accent/10 flex items-center justify-center text-celeste-accentDark shrink-0">
            <Mail size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Outlook</p>
            <p className="text-xs text-celeste-muted mt-0.5">
              Stessa funzione per Outlook/Hotmail, con evento gemello su Outlook Calendar. Attiva.
            </p>
          </div>
        </div>
      </div>

      <div className="card-light space-y-2.5">
        <p className="font-medium">Incluso in ogni piano</p>
        {[
          "Memorie, ricordi e ricerca su tutta la cronologia",
          "Promemoria farmaci e scadenze via notifica push",
          "Consigli nei paraggi basati sugli spostamenti",
        ].map((voce) => (
          <div key={voce} className="flex items-start gap-2 text-sm text-celeste-muted">
            <Check size={16} className="text-celeste-accentDark shrink-0 mt-0.5" />
            <span>{voce}</span>
          </div>
        ))}
        <div className="flex items-start gap-2 text-sm text-celeste-muted">
          <InfinityIcon size={16} className="text-celeste-accentDark shrink-0 mt-0.5" />
          <span>Nessuna scadenza sui ricordi già salvati, su qualsiasi piano</span>
        </div>
      </div>

      <p className="text-xs text-celeste-muted text-center px-4">
        Il pagamento è gestito da Stripe. Gli abbonamenti mensile e annuale si rinnovano
        automaticamente e possono essere annullati in qualsiasi momento; il piano Founder è un
        pagamento unico, senza rinnovi.
      </p>
    </div>
  );
}

export default function PremiumPage() {
  return (
    <Suspense fallback={null}>
      <PremiumContent />
    </Suspense>
  );
}
