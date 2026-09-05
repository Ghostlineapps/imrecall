"use client";

import useSWR from "swr";
import { Sparkles } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type InsightExample = { id: string; ai_summary: string | null; title: string | null; memory_date: string };

type InsightsResponse = {
  insight: {
    phase: string;
    phaseLabel: string;
    tags: string[];
    examples: InsightExample[];
    cyclesConsidered: number;
  } | null;
  reason?: "not_onboarded" | "not_enough_cycles" | "no_pattern_found";
  phase?: string;
};

function formatDayIt(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

/**
 * La sezione che nessuna app di solo tracciamento ciclo può offrire: incrocia
 * la fase corrente con i ricordi già salvati dall'utente nella stessa fase
 * nei cicli precedenti. Finché non ci sono abbastanza dati mostriamo un
 * placeholder onesto sul perché ("continua a registrare"), mai un pattern
 * inventato per riempire lo spazio.
 */
export function CycleInsights() {
  const { data, isLoading } = useSWR<InsightsResponse>("/api/cycle/insights", fetcher);

  if (isLoading) return null;
  if (!data) return null;

  if (!data.insight) {
    const message =
      data.reason === "not_enough_cycles"
        ? "Servono almeno un paio di cicli registrati per iniziare a vedere pattern nei tuoi ricordi."
        : data.reason === "no_pattern_found"
          ? "Ancora nessun pattern ricorrente nei ricordi di questa fase: continua a registrare e a salvare ricordi, e se c'è una tendenza la troveremo."
          : "Registra qualche ciclo per sbloccare le correlazioni con i tuoi ricordi.";

    return (
      <div className="card-light space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-celeste-accentDark" />
          <p className="text-sm font-medium text-celeste-navy">Correlazioni con i tuoi ricordi</p>
        </div>
        <p className="text-xs text-celeste-muted">{message}</p>
      </div>
    );
  }

  const { phaseLabel, tags, examples, cyclesConsidered } = data.insight;

  return (
    <div className="card-light space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-celeste-accentDark" />
        <p className="text-sm font-medium text-celeste-navy">Correlazioni con i tuoi ricordi</p>
      </div>

      <p className="text-sm text-celeste-navy">
        Nella <strong>{phaseLabel.toLowerCase()}</strong>, negli ultimi {cyclesConsidered} cicli hai scritto spesso
        ricordi legati a:
      </p>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2.5 py-1 rounded-full bg-celeste-accent/10 text-celeste-accentDark font-medium"
          >
            #{tag}
          </span>
        ))}
      </div>

      {examples.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-celeste-navy/5">
          {examples.map((ex) => (
            <div key={ex.id} className="text-xs text-celeste-muted">
              <span className="text-celeste-navy">{ex.title || ex.ai_summary || "Ricordo"}</span>
              {" — "}
              {formatDayIt(ex.memory_date)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
