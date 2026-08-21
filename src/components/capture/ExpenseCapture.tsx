"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { mutate } from "swr";

// Inserimento manuale di una spesa, senza foto — per chi non ha lo
// scontrino a portata di mano o preferisce scrivere l'importo a mano. La
// lettura automatica dallo scontrino fotografato passa invece dal tab
// "Foto" (vedi ImageCapture isExpense + RECEIPT_DETECTED in
// /api/upload/image).
const CATEGORIES: [string, string][] = [
  ["spesa", "Spesa"],
  ["trasporti", "Trasporti"],
  ["ristorazione", "Ristorazione"],
  ["casa", "Casa"],
  ["salute", "Salute"],
  ["svago", "Svago"],
  ["altro", "Altro"],
];

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ExpenseCapture({ onSaved }: { onSaved: () => void }) {
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("altro");
  const [date, setDate] = useState(todayLocalDate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Inserisci un importo valido.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor: vendor.trim() || null, amount: parsedAmount, category, expense_date: date }),
      });
      if (!res.ok) throw new Error("save_failed");

      mutate("/api/expenses");
      onSaved();
    } catch {
      setError("Salvataggio fallito. Controlla la connessione e riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-4 space-y-4">
      <input
        value={vendor}
        onChange={(e) => setVendor(e.target.value)}
        placeholder="Negozio o esercizio, es. Esselunga (opzionale)"
        className="input-field w-full"
        autoFocus
      />

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Importo, es. 24.90"
          className="input-field flex-1"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field flex-1" />
      </div>

      <div className="space-y-2">
        <p className="text-xs text-white/50">Categoria</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setCategory(value)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                category === value ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        <Receipt size={16} />
        {saving ? "Salvataggio…" : "Salva spesa"}
      </button>
      {error && <p className="text-urgent text-sm">{error}</p>}
    </div>
  );
}
