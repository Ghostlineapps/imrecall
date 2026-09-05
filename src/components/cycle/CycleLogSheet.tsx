"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { X } from "lucide-react";
import clsx from "clsx";
import { FLOW_OPTIONS, MOOD_OPTIONS, SYMPTOM_OPTIONS } from "@/lib/cycle/predictions";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FLOW_LABELS: Record<(typeof FLOW_OPTIONS)[number], string> = {
  spotting: "Spotting",
  light: "Leggero",
  medium: "Medio",
  heavy: "Abbondante",
};

const SYMPTOM_LABELS: Record<(typeof SYMPTOM_OPTIONS)[number], string> = {
  crampi: "Crampi",
  mal_di_testa: "Mal di testa",
  gonfiore: "Gonfiore",
  acne: "Acne",
  tensione_seno: "Tensione al seno",
  nausea: "Nausea",
  stanchezza: "Stanchezza",
  mal_di_schiena: "Mal di schiena",
  insonnia: "Insonnia",
};

const MOOD_LABELS: Record<(typeof MOOD_OPTIONS)[number], string> = {
  felice: "Felice",
  energica: "Energica",
  irritabile: "Irritabile",
  triste: "Triste",
  ansiosa: "Ansiosa",
  stanca: "Stanca",
};

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-xs px-3 py-1.5 rounded-full border transition-colors",
        selected
          ? "bg-celeste-accent text-white border-celeste-accent"
          : "bg-celeste-accent/5 text-celeste-navy border-celeste-navy/10"
      )}
    >
      {children}
    </button>
  );
}

/** Log di un singolo giorno: flusso (o nessuno), sintomi e umore a scelta
 * multipla, note libere. Un giorno può avere sintomi/umore anche senza
 * flusso — non serve essere in mestruazione per registrare come ci si
 * sente, ed è proprio quel dato "fuori mestruazione" che alimenta le
 * correlazioni in CycleInsights. */
export function CycleLogSheet({ isoDate, onClose }: { isoDate: string; onClose: () => void }) {
  const { data } = useSWR(`/api/cycle/logs?from=${isoDate}&to=${isoDate}`, fetcher);
  const existing = data?.logs?.[0] ?? null;

  const [flow, setFlow] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [mood, setMood] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setFlow(existing.flow ?? null);
      setSymptoms(existing.symptoms ?? []);
      setMood(existing.mood ?? []);
      setNotes(existing.notes ?? "");
    }
  }, [existing]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/cycle/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_date: isoDate, flow, symptoms, mood, notes: notes || null }),
      });
      mutate((key) => typeof key === "string" && key.startsWith("/api/cycle"));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const label = new Date(isoDate + "T00:00:00").toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="fixed inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-celeste-navy/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto text-celeste-navy">
        <div className="flex items-center justify-between">
          <p className="font-medium capitalize">{label}</p>
          <button onClick={onClose} className="text-celeste-muted hover:text-celeste-navy p-1">
            <X size={20} />
          </button>
        </div>

        <div>
          <p className="text-xs text-celeste-muted mb-1.5">Flusso</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={flow === null} onClick={() => setFlow(null)}>
              Nessuno
            </Chip>
            {FLOW_OPTIONS.map((f) => (
              <Chip key={f} selected={flow === f} onClick={() => setFlow(f)}>
                {FLOW_LABELS[f]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-celeste-muted mb-1.5">Sintomi</p>
          <div className="flex flex-wrap gap-2">
            {SYMPTOM_OPTIONS.map((s) => (
              <Chip key={s} selected={symptoms.includes(s)} onClick={() => toggle(symptoms, setSymptoms, s)}>
                {SYMPTOM_LABELS[s]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-celeste-muted mb-1.5">Umore</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((m) => (
              <Chip key={m} selected={mood.includes(m)} onClick={() => toggle(mood, setMood, m)}>
                {MOOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-celeste-muted">Note (facoltative)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="input-field-light mt-1 resize-none"
            placeholder="Qualcosa in più su come stai oggi…"
          />
        </div>

        <button onClick={save} disabled={saving} className="btn-primary-light w-full">
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>
    </div>
  );
}
