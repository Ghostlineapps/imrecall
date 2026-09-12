"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import clsx from "clsx";
import { DIETARY_OPTIONS, INTEREST_OPTIONS } from "@/lib/constants/preferences";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Toggle a chip singolo con salvataggio immediato (niente form/tasto Salva):
// scegliere "vegano" deve avere effetto subito sui consigli nei paraggi in
// Home, senza un passaggio in più da ricordarsi di fare.
// 2026-08-26: palette celeste (undicesima schermata convertita).
export default function ProfilePreferencesPage() {
  const { data, isLoading } = useSWR("/api/profile", fetcher);

  const [diet, setDiet] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [tracksCycle, setTracksCycle] = useState(false);
  const [tracksPregnancy, setTracksPregnancy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDiet(data.dietary_preferences ?? []);
      setInterests(data.interests ?? []);
      setTracksCycle(!!data.tracks_cycle);
      setTracksPregnancy(!!data.tracks_pregnancy);
    }
  }, [data]);

  async function toggle(kind: "dietary_preferences" | "interests", value: string) {
    const current = kind === "dietary_preferences" ? diet : interests;
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

    if (kind === "dietary_preferences") setDiet(next);
    else setInterests(next);

    setSaving(value);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kind]: next }),
      });
    } finally {
      setSaving(null);
    }
  }

  // Domanda posta la prima volta in /onboarding (migration 033): qui la si
  // può cambiare in qualsiasi momento, sullo stesso principio di
  // salvataggio immediato delle altre preferenze in questa pagina.
  async function toggleCycle() {
    const next = !tracksCycle;
    setTracksCycle(next);
    setSaving("tracks_cycle");
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks_cycle: next }),
      });
    } finally {
      setSaving(null);
    }
  }

  // Stessa cosa per il pulsante Gravidanza nella Dashboard (migration 034),
  // domanda gemella di tracks_cycle chiesta nello stesso step di onboarding.
  async function togglePregnancy() {
    const next = !tracksPregnancy;
    setTracksPregnancy(next);
    setSaving("tracks_pregnancy");
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks_pregnancy: next }),
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">Il tuo profilo</h1>
        <p className="text-sm text-celeste-muted mt-1">
          Usiamo queste preferenze per segnalarti i posti giusti quando arrivi in un posto nuovo —
          ad esempio i ristoranti vegani vicino a te, invece di una lista generica.
        </p>
      </div>

      <div className="card-light space-y-3">
        <p className="font-medium">Alimentazione</p>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((opt) => {
            const active = diet.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle("dietary_preferences", opt.value)}
                disabled={saving === opt.value}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  active
                    ? "bg-gradient-to-br from-celeste-accent to-celeste-accentDark border-celeste-accent text-white"
                    : "border-celeste-navy/15 text-celeste-navy/60 hover:border-celeste-navy/30"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-light space-y-3">
        <p className="font-medium">Interessi</p>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((opt) => {
            const active = interests.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle("interests", opt.value)}
                disabled={saving === opt.value}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  active
                    ? "bg-gradient-to-br from-celeste-accent to-celeste-accentDark border-celeste-accent text-white"
                    : "border-celeste-navy/15 text-celeste-navy/60 hover:border-celeste-navy/30"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-light space-y-3">
        <p className="font-medium">Ciclo mestruale</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={tracksCycle}
            onChange={toggleCycle}
            disabled={saving === "tracks_cycle"}
            className="shrink-0"
          />
          Mostra la card del ciclo in Home e in Salute
        </label>
        <p className="text-celeste-muted text-xs">
          Previsioni, sintomi e correlazioni con i tuoi ricordi. Puoi attivarla o disattivarla
          quando vuoi.
        </p>
      </div>

      <div className="card-light space-y-3">
        <p className="font-medium">Gravidanza</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={tracksPregnancy}
            onChange={togglePregnancy}
            disabled={saving === "tracks_pregnancy"}
            className="shrink-0"
          />
          Mostra Gravidanza nella ruota della Dashboard
        </label>
        <p className="text-celeste-muted text-xs">
          Appuntamenti, referti/esami e scadenze legati a una gravidanza. Puoi attivarla o
          disattivarla quando vuoi.
        </p>
      </div>

      {!isLoading && diet.length === 0 && interests.length === 0 && (
        <p className="text-celeste-muted text-xs px-1">
          Non hai ancora selezionato nulla: per ora i consigli nei paraggi saranno generici.
        </p>
      )}
    </div>
  );
}
