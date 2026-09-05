"use client";

import { useState } from "react";
import { mutate } from "swr";
import { Droplet } from "lucide-react";

/**
 * Primo avvio del tracciamento ciclo: chiediamo solo la data dell'ultima
 * mestruazione (obbligatoria: serve a "ancorare" la prima previsione) più
 * due stime medie che l'utente conosce già a memoria — non ha senso
 * lasciarla su un default arbitrario finché non abbiamo dati reali per
 * calcolarla da soli. Salviamo PRIMA le impostazioni (stime manuali) e SOLO
 * DOPO il log del primo giorno: recalculateCyclePeriods (lato server) non
 * tocca le medie finché non ci sono cicli completi da cui ricalcolarle
 * davvero, ma l'ordine resta comunque più esplicito così — vedi
 * src/lib/cycle/recalculate.ts.
 */
export function CycleOnboarding() {
  const [lastPeriodDate, setLastPeriodDate] = useState("");
  const [avgCycle, setAvgCycle] = useState("28");
  const [avgPeriod, setAvgPeriod] = useState("5");
  const [trackingMode, setTrackingMode] = useState<"general_health" | "trying_to_conceive" | "avoiding_pregnancy">(
    "general_health"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!lastPeriodDate) {
      setError("Inserisci la data di inizio dell'ultima mestruazione.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const settingsRes = await fetch("/api/cycle/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_mode: trackingMode,
          average_cycle_length: Number(avgCycle),
          average_period_length: Number(avgPeriod),
        }),
      });
      if (!settingsRes.ok) throw new Error();

      const logRes = await fetch("/api/cycle/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_date: lastPeriodDate, flow: "medium" }),
      });
      if (!logRes.ok) throw new Error();

      mutate("/api/cycle/status");
      mutate((key) => typeof key === "string" && key.startsWith("/api/cycle/logs"));
    } catch {
      setError("Salvataggio fallito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-light space-y-4">
      <div className="flex items-center gap-2">
        <Droplet size={18} className="text-celeste-accentDark" />
        <p className="font-medium">Inizia a tracciare il ciclo</p>
      </div>
      <p className="text-sm text-celeste-muted">
        Ti bastano tre informazioni per iniziare: le previsioni diventano più precise ad ogni ciclo registrato.
      </p>

      <div>
        <label className="text-xs text-celeste-muted">Quando è iniziata la tua ultima mestruazione?</label>
        <input
          type="date"
          value={lastPeriodDate}
          onChange={(e) => setLastPeriodDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="input-field-light mt-1"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-celeste-muted">Durata media del ciclo (giorni)</label>
          <input
            type="number"
            min={15}
            max={60}
            value={avgCycle}
            onChange={(e) => setAvgCycle(e.target.value)}
            className="input-field-light mt-1"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-celeste-muted">Durata media mestruazioni (giorni)</label>
          <input
            type="number"
            min={1}
            max={14}
            value={avgPeriod}
            onChange={(e) => setAvgPeriod(e.target.value)}
            className="input-field-light mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-celeste-muted">Cosa ti interessa di più tracciare?</label>
        <div className="flex flex-col gap-1.5 mt-1.5">
          {(
            [
              ["general_health", "Il mio benessere generale"],
              ["trying_to_conceive", "Sto cercando una gravidanza"],
              ["avoiding_pregnancy", "Voglio evitare una gravidanza"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTrackingMode(value)}
              className={`w-full text-left text-sm px-3.5 py-2.5 rounded-xl transition-colors border ${
                trackingMode === value
                  ? "bg-celeste-accent/10 border-celeste-accent text-celeste-accentDark font-medium"
                  : "border-celeste-navy/10 text-celeste-navy"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-urgent text-sm">{error}</p>}

      <button onClick={save} disabled={saving} className="btn-primary-light w-full">
        {saving ? "Salvataggio…" : "Inizia a tracciare"}
      </button>

      <p className="text-xs text-celeste-muted">
        Non sostituisce un parere medico: per qualsiasi dubbio su irregolarità o sintomi, parlane con il tuo
        ginecologo.
      </p>
    </div>
  );
}
