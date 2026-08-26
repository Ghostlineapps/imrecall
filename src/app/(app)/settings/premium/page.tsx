"use client";

import Link from "next/link";
import useSWR from "swr";
import { Sparkles, Check, Infinity as InfinityIcon, Mail, Crown } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Pagina vetrina del piano Premium (richiesta 2026-08-26): mostra cosa
 * include, senza alcun flusso di acquisto reale — Stripe non è ancora
 * collegato e comunque tutti gli account attuali resteranno Premium a vita.
 * Se in futuro arriva un vero checkout, questa pagina è il punto giusto
 * dove agganciarlo.
 */

const CONFRONTO = [
  { voce: "Memorie al mese", free: "100", premium: "Illimitate" },
  { voce: "Minuti di trascrizione al mese", free: "60", premium: "600" },
  { voce: "Durata max. di una registrazione audio", free: "30 min", premium: "100 min" },
  { voce: "Durata max. di una riunione registrata", free: "30 min", premium: "90 min" },
  { voce: "Documenti al mese", free: "5", premium: "Illimitati" },
];

export default function PremiumPage() {
  const { data } = useSWR("/api/user/usage", fetcher);
  const isPremium = data?.subscription_tier && data.subscription_tier !== "free";

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

      {isPremium && (
        <div className="card-light flex items-center gap-3 bg-gradient-to-br from-celeste-accent/10 to-celeste-accentDark/10 border-celeste-accent/20">
          <div className="w-9 h-9 rounded-full bg-celeste-accent/15 flex items-center justify-center text-celeste-accentDark shrink-0">
            <Crown size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Il tuo account è già Premium</p>
            <p className="text-xs text-celeste-muted mt-0.5">
              Gli account attivati in questa fase restano Premium a vita, senza costi.
            </p>
          </div>
        </div>
      )}

      <div className="card-light space-y-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold">11,99€</span>
          <span className="text-sm text-celeste-muted">/mese</span>
        </div>
        <p className="text-xs text-celeste-muted">
          Oppure 119€/anno (equivalente a circa 9,92€/mese)
        </p>
      </div>

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
        Il pagamento non è ancora attivo. Questa pagina mostra cosa include Premium; per ora nessun
        account viene addebitato.
      </p>
    </div>
  );
}
