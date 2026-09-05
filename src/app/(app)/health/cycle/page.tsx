"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Droplet, Plus } from "lucide-react";
import { CycleOnboarding } from "@/components/cycle/CycleOnboarding";
import { CycleStatusHeader } from "@/components/cycle/CycleStatusHeader";
import { CycleCalendar } from "@/components/cycle/CycleCalendar";
import { CycleInsights } from "@/components/cycle/CycleInsights";
import { CycleLogSheet } from "@/components/cycle/CycleLogSheet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TRACKING_MODE_LABELS: Record<string, string> = {
  general_health: "Il mio benessere generale",
  trying_to_conceive: "Sto cercando una gravidanza",
  avoiding_pregnancy: "Voglio evitare una gravidanza",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pagina dedicata al ciclo: stessa struttura a sezioni di Gravidanza
 * (countdown/status in cima, poi calendario, poi la sezione che qui è unica
 * — le correlazioni con i ricordi — poi le impostazioni ripiegabili in
 * fondo). Prima dell'onboarding mostra solo il form iniziale: non ha senso
 * mostrare un calendario vuoto o previsioni senza nessun dato da cui
 * calcolarle.
 */
export default function CyclePage() {
  const { data, isLoading } = useSWR("/api/cycle/status", fetcher);
  const [openDay, setOpenDay] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-24 space-y-4">
        <div className="card-light h-24 animate-pulse bg-celeste-navy/5" />
      </div>
    );
  }

  const onboarded = !!data?.onboarded;
  const status = data?.status;

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-24 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Droplet size={22} className="text-celeste-accentDark" />
        <h1 className="text-xl font-semibold">Ciclo</h1>
      </div>
      <p className="text-celeste-muted text-xs -mt-4">
        Non sostituisce un parere medico: per irregolarità o sintomi persistenti parlane con il tuo ginecologo.
      </p>

      {!onboarded ? (
        <CycleOnboarding />
      ) : (
        <>
          <button
            onClick={() => setOpenDay(todayIso())}
            className="btn-primary-light w-full flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Registra oggi
          </button>

          <CycleStatusHeader status={status} />
          <CycleCalendar
            fertileWindow={status?.fertileWindow ?? null}
            nextPeriodRange={
              status?.nextPeriod ? { rangeStartDate: status.nextPeriod.rangeStartDate, rangeEndDate: status.nextPeriod.rangeEndDate } : null
            }
            onSelectDay={setOpenDay}
          />
          <CycleInsights />
          <SettingsSection settings={data?.settings ?? null} />
        </>
      )}

      {openDay && <CycleLogSheet isoDate={openDay} onClose={() => setOpenDay(null)} />}
    </div>
  );
}

function SettingsSection({ settings }: { settings: any }) {
  const [saving, setSaving] = useState(false);

  async function updateMode(mode: string) {
    setSaving(true);
    try {
      await fetch("/api/cycle/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_mode: mode }),
      });
      mutate("/api/cycle/status");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNotifications() {
    setSaving(true);
    try {
      await fetch("/api/cycle/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications_enabled: !settings?.notifications_enabled }),
      });
      mutate("/api/cycle/status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="text-xs text-celeste-muted px-1">
      <summary className="cursor-pointer">Impostazioni ciclo</summary>
      <div className="mt-2 card-light space-y-3">
        <div>
          <p className="text-xs text-celeste-muted mb-1.5">Cosa ti interessa di più tracciare?</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(TRACKING_MODE_LABELS).map(([value, label]) => (
              <button
                key={value}
                disabled={saving}
                onClick={() => updateMode(value)}
                className={`w-full text-left text-sm px-3.5 py-2.5 rounded-xl transition-colors border ${
                  settings?.tracking_mode === value
                    ? "bg-celeste-accent/10 border-celeste-accent text-celeste-accentDark font-medium"
                    : "border-celeste-navy/10 text-celeste-navy"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-celeste-navy pt-1 border-t border-celeste-navy/5">
          <input
            type="checkbox"
            checked={settings?.notifications_enabled ?? true}
            onChange={toggleNotifications}
            disabled={saving}
            className="w-4 h-4 accent-celeste-accentDark"
          />
          Promemoria e previsioni notificate
        </label>
      </div>
    </details>
  );
}
