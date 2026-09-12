"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import clsx from "clsx";
import { DIETARY_OPTIONS, INTEREST_OPTIONS } from "@/lib/constants/preferences";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Ordine di visualizzazione dei giorni (Lun-Dom, come ci si aspetta in
// Italia) — le chiavi restano sigle inglesi fisse per essere stabili
// indipendentemente dalla lingua, vedi migration 035 e home/page.tsx dove
// vengono lette.
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
  mon: "Lunedì",
  tue: "Martedì",
  wed: "Mercoledì",
  thu: "Giovedì",
  fri: "Venerdì",
  sat: "Sabato",
  sun: "Domenica",
};

// Chip pronte per il caso comune (zero digitazione), più un campo libero
// per chi vuole scriverne uno suo — vedi discussione: niente di
// preimpostato per genere, la scelta è sempre dell'utente.
const REMINDER_PRESETS = ["Skincare", "Parrucchiere/Barbiere", "Bucato", "Palestra", "Spesa", "Spazzatura"];

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
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDiet(data.dietary_preferences ?? []);
      setInterests(data.interests ?? []);
      setTracksCycle(!!data.tracks_cycle);
      setTracksPregnancy(!!data.tracks_pregnancy);
      setReminders(data.weekly_reminders ?? {});
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

  // Promemoria del giorno (migration 035): il client rimanda sempre
  // l'intero oggetto, stesso pattern degli array di preferenze sopra — il
  // server sanifica comunque lato suo, vedi /api/profile PATCH.
  async function saveReminders(next: Record<string, string>) {
    setReminders(next);
    setSaving("weekly_reminders");
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekly_reminders: next }),
      });
    } finally {
      setSaving(null);
    }
  }

  function setDayReminder(day: string, label: string) {
    saveReminders({ ...reminders, [day]: label });
    setEditingDay(null);
    setCustomInput("");
  }

  function clearDayReminder(day: string) {
    const next = { ...reminders };
    delete next[day];
    saveReminders(next);
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

      <div className="card-light space-y-3">
        <p className="font-medium">Promemoria del giorno</p>
        <p className="text-celeste-muted text-xs">
          Un piccolo promemoria ricorrente che compare nel saluto in Home, ad esempio
          &ldquo;Buongiorno, {"{tu}"} — bucato oggi?&rdquo;. Scegli da una chip pronta o scrivine uno
          tuo, giorno per giorno.
        </p>
        <div className="space-y-2">
          {DAY_ORDER.map((day) => {
            const label = reminders[day];
            const isEditing = editingDay === day;
            return (
              <div key={day} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-celeste-navy/70 w-24 shrink-0">{DAY_LABELS[day]}</span>
                  {label ? (
                    <div className="flex-1 flex items-center justify-between gap-2 bg-celeste-navy/[0.03] rounded-lg px-3 py-1.5">
                      <span className="text-sm font-medium truncate">{label}</span>
                      <button
                        onClick={() => clearDayReminder(day)}
                        disabled={saving === "weekly_reminders"}
                        className="text-celeste-muted text-xs shrink-0 hover:text-celeste-navy"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingDay(isEditing ? null : day);
                        setCustomInput("");
                      }}
                      className="flex-1 text-left text-sm text-celeste-muted border border-dashed border-celeste-navy/20 rounded-lg px-3 py-1.5 hover:border-celeste-navy/40"
                    >
                      + Aggiungi
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div className="pl-[6.5rem] space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {REMINDER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setDayReminder(day, preset)}
                          disabled={saving === "weekly_reminders"}
                          className="px-3 py-1 rounded-full text-xs border border-celeste-navy/15 text-celeste-navy/70 hover:border-celeste-navy/30"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customInput.trim()) setDayReminder(day, customInput.trim());
                        }}
                        placeholder="Scrivine uno tu…"
                        maxLength={40}
                        className="flex-1 text-sm border border-celeste-navy/15 rounded-lg px-3 py-1.5 bg-white"
                      />
                      <button
                        onClick={() => customInput.trim() && setDayReminder(day, customInput.trim())}
                        disabled={!customInput.trim() || saving === "weekly_reminders"}
                        className="text-sm text-celeste-accentDark font-medium disabled:opacity-40 shrink-0"
                      >
                        Aggiungi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isLoading && diet.length === 0 && interests.length === 0 && (
        <p className="text-celeste-muted text-xs px-1">
          Non hai ancora selezionato nulla: per ora i consigli nei paraggi saranno generici.
        </p>
      )}
    </div>
  );
}
