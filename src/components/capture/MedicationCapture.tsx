"use client";

import { useRef, useState } from "react";
import { Pill, ImagePlus, X, Plus } from "lucide-react";
import { mutate } from "swr";

// A differenza delle altre catture, qui non c'è nessuna chiamata a GPT: il
// nome e la dose del farmaco li scrive l'utente stesso, di solito
// leggendoli dalla prescrizione del medico ("15 gocce", "due compresse",
// "una supposta", "una siringa" — testo libero, non un formato fisso).
// L'unica parte "intelligente" è il promemoria: agli orari scelti qui,
// pg_cron manda una notifica push col nome ESATTO del farmaco ("Prendi il
// Bivis"), non un avviso generico — pensato per essere inequivocabile
// anche per un paziente anziano con più farmaci diversi.

type RecurrenceType = "daily" | "weekly" | "interval" | "monthly";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

// Data locale (fuso del dispositivo, che per i nostri utenti coincide con
// Europe/Rome) in formato "YYYY-MM-DD" — serve come ancora di partenza per
// "ogni N giorni" e come default per "giorno del mese", senza il problema
// di new Date().toISOString() che usa UTC e può sballare di un giorno
// vicino alla mezzanotte.
function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function MedicationCapture({ onSaved }: { onSaved: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [timeInput, setTimeInput] = useState("08:00");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ricorrenza (migrazione 019) — "daily" (ogni giorno) è il default e
  // copre il caso più comune senza dover toccare nient'altro.
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState(2); // 2 = giorni alterni, il caso più comune
  const [dayOfMonth, setDayOfMonth] = useState(() => new Date().getDate());
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState(todayLocalDate());
  const [endDate, setEndDate] = useState("");

  function addTime() {
    if (!timeInput) return;
    setTimes((prev) => (prev.includes(timeInput) ? prev : [...prev, timeInput].sort()));
  }

  function removeTime(t: string) {
    setTimes((prev) => prev.filter((x) => x !== t));
  }

  function toggleWeekday(value: number) {
    setDaysOfWeek((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort()
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Scrivi il nome del farmaco.");
      return;
    }

    // Niente più bisogno di cliccare "+": se non è stato aggiunto nessun
    // chip esplicito, usiamo direttamente l'orario impostato nel campo.
    const finalTimes = times.length > 0 ? times : timeInput ? [timeInput] : [];
    if (finalTimes.length === 0) {
      setError("Imposta almeno un orario di promemoria.");
      return;
    }

    if (recurrenceType === "weekly" && daysOfWeek.length === 0) {
      setError("Scegli almeno un giorno della settimana.");
      return;
    }
    if (useDateRange && endDate && startDate && endDate < startDate) {
      setError("La data di fine non può essere prima di quella di inizio.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("dose", dose.trim());
      formData.append("times", JSON.stringify(finalTimes));
      if (photo) formData.append("photo", photo, photo.name);

      formData.append("recurrence_type", recurrenceType);
      if (recurrenceType === "weekly") {
        formData.append("days_of_week", JSON.stringify(daysOfWeek));
      }
      if (recurrenceType === "interval") {
        formData.append("interval_days", String(intervalDays));
        formData.append("interval_anchor_date", todayLocalDate());
      }
      if (recurrenceType === "monthly") {
        formData.append("day_of_month", String(dayOfMonth));
      }
      if (useDateRange) {
        if (startDate) formData.append("start_date", startDate);
        if (endDate) formData.append("end_date", endDate);
      }

      const res = await fetch("/api/medications", { method: "POST", body: formData });
      if (!res.ok) throw new Error("save_failed");

      mutate("/api/medications");
      mutate("/api/medications/today");
      mutate("/api/memories");
      onSaved();
    } catch {
      setError("Salvataggio fallito. Controlla la connessione e riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 rounded-xl border-2 border-dashed border-white/15 flex items-center justify-center text-white/40 hover:text-white/70 hover:border-white/30 transition-colors shrink-0"
            aria-label="Fotografa la confezione (opzionale)"
          >
            <ImagePlus size={20} />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPhoto(file);
              setPreview(URL.createObjectURL(file));
            }
          }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome del farmaco, es. Bivis"
          className="input-field flex-1"
          autoFocus
        />
      </div>

      <input
        value={dose}
        onChange={(e) => setDose(e.target.value)}
        placeholder="Dose dalla prescrizione, es. 15 gocce, due compresse, una supposta…"
        className="input-field w-full"
      />

      <div className="space-y-2">
        <p className="text-xs text-white/50">Orario del promemoria</p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            className="input-field flex-1"
          />
          <button
            onClick={addTime}
            className="btn-ghost p-2.5"
            aria-label="Aggiungi un secondo orario (es. mattina e sera)"
          >
            <Plus size={18} />
          </button>
        </div>
        {times.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {times.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 text-xs bg-white/5 text-white/80 px-3 py-1.5 rounded-full"
              >
                {t}
                <button onClick={() => removeTime(t)} aria-label={`Rimuovi orario ${t}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {times.length === 0 && (
          <p className="text-[11px] text-white/35">
            Salvando verrà usato l'orario impostato sopra. Usa il "+" solo se prendi il
            farmaco più volte al giorno.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-white/50">Ogni quanto</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["daily", "Tutti i giorni"],
              ["weekly", "Giorni specifici"],
              ["interval", "Ogni tot giorni"],
              ["monthly", "Una volta al mese"],
            ] as [RecurrenceType, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setRecurrenceType(value)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                recurrenceType === value
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {recurrenceType === "weekly" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {WEEKDAYS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleWeekday(value)}
                className={`text-xs w-11 py-1.5 rounded-full transition-colors ${
                  daysOfWeek.includes(value)
                    ? "bg-white text-black"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {recurrenceType === "interval" && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-white/50">Ogni</span>
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value) || 1))}
              className="input-field w-16 text-center"
            />
            <span className="text-xs text-white/50">
              giorni {intervalDays === 2 ? "(giorni alterni)" : ""} — a partire da oggi
            </span>
          </div>
        )}

        {recurrenceType === "monthly" && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-white/50">Il giorno</span>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) =>
                setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))
              }
              className="input-field w-16 text-center"
            />
            <span className="text-xs text-white/50">di ogni mese</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
          <input
            type="checkbox"
            checked={useDateRange}
            onChange={(e) => setUseDateRange(e.target.checked)}
            className="accent-white"
          />
          Solo per un periodo limitato (es. un antibiotico)
        </label>
        {useDateRange && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-field flex-1"
              aria-label="Data di inizio"
            />
            <span className="text-xs text-white/40">a</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-field flex-1"
              aria-label="Data di fine (opzionale)"
            />
          </div>
        )}
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        <Pill size={16} />
        {saving ? "Salvataggio…" : "Salva farmaco"}
      </button>
      {error && <p className="text-urgent text-sm">{error}</p>}
    </div>
  );
}
