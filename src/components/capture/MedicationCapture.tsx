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

  function addTime() {
    if (!timeInput) return;
    setTimes((prev) => (prev.includes(timeInput) ? prev : [...prev, timeInput].sort()));
  }

  function removeTime(t: string) {
    setTimes((prev) => prev.filter((x) => x !== t));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Scrivi il nome del farmaco.");
      return;
    }
    if (times.length === 0) {
      setError("Aggiungi almeno un orario di promemoria.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("dose", dose.trim());
      formData.append("times", JSON.stringify(times));
      if (photo) formData.append("photo", photo, photo.name);

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
        <p className="text-xs text-white/50">Orari del promemoria</p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            className="input-field flex-1"
          />
          <button onClick={addTime} className="btn-ghost p-2.5" aria-label="Aggiungi orario">
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
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        <Pill size={16} />
        {saving ? "Salvataggio…" : "Salva farmaco"}
      </button>
      {error && <p className="text-urgent text-sm">{error}</p>}
    </div>
  );
}
