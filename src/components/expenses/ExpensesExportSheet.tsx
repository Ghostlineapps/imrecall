"use client";

import { useState } from "react";
import { X, FileDown } from "lucide-react";

type PeriodMode = "current" | "month" | "range";

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthValueToRange(value: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, "0")}` };
}

// Sheet per scegliere il periodo prima di generare la nota spese
// stampabile (vedi /expenses/export). Tre modalità, dalla più comune alla
// più flessibile: mese corrente con un tap, un altro mese specifico, o un
// intervallo di date libero — coprono tutti i casi ragionevoli senza dover
// scegliere sempre due date a mano.
export function ExpensesExportSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<PeriodMode>("current");
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    let range: { from: string; to: string } | null = null;

    if (mode === "current") {
      range = monthValueToRange(currentMonthValue());
    } else if (mode === "month") {
      range = monthValueToRange(monthValue);
    } else {
      if (!rangeFrom || !rangeTo) {
        setError("Scegli entrambe le date.");
        return;
      }
      if (rangeFrom > rangeTo) {
        setError("La data di inizio deve precedere quella di fine.");
        return;
      }
      range = { from: rangeFrom, to: rangeTo };
    }

    if (!range) {
      setError("Periodo non valido.");
      return;
    }

    window.open(`/expenses/export?from=${range.from}&to=${range.to}`, "_blank");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full bg-surface rounded-t-3xl p-5 pb-8 animate-fade-in space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white/70">Esporta nota spese</p>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs text-white/40">
          Genera una nota spese stampabile in PDF, con le foto degli scontrini incluse. Scegli il periodo:
        </p>

        <div className="space-y-2">
          {(
            [
              ["current", "Mese corrente"],
              ["month", "Un altro mese"],
              ["range", "Intervallo di date"],
            ] as [PeriodMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`w-full text-left text-sm px-3.5 py-2.5 rounded-xl transition-colors ${
                mode === value ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "month" && (
          <input
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            className="input-field w-full"
          />
        )}

        {mode === "range" && (
          <div className="flex items-center gap-2">
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="input-field flex-1" />
            <span className="text-white/30 text-sm">—</span>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="input-field flex-1" />
          </div>
        )}

        {error && <p className="text-urgent text-sm">{error}</p>}

        <button onClick={handleGenerate} className="btn-primary w-full flex items-center justify-center gap-2">
          <FileDown size={16} />
          Genera nota spese
        </button>
      </div>
    </div>
  );
}
