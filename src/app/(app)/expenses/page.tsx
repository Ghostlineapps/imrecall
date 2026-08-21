"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Receipt, Pencil, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { CaptureSheet } from "@/components/capture/CaptureSheet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CATEGORIES: [string, string][] = [
  ["spesa", "Spesa"],
  ["trasporti", "Trasporti"],
  ["ristorazione", "Ristorazione"],
  ["casa", "Casa"],
  ["salute", "Salute"],
  ["svago", "Svago"],
  ["altro", "Altro"],
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);

function currentMonthPrefix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatEuro(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Sezione "Spese" (migrazione 022) — stesso schema di /health: un punto
// d'ingresso dedicato per fotografare uno scontrino (lettura automatica di
// importo/negozio/categoria via RECEIPT_DETECTED) o inserire una spesa a
// mano, più un budget mensile totale opzionale con avviso quando ci si
// avvicina o si supera la soglia.
export default function ExpensesPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const { data, isLoading, mutate } = useSWR("/api/expenses", fetcher);

  const expenses: any[] = data?.expenses ?? [];
  const monthlyBudget: number | null = data?.monthly_budget ?? null;

  const monthPrefix = currentMonthPrefix();
  const monthTotal = useMemo(
    () => expenses.filter((e) => e.expense_date?.startsWith(monthPrefix)).reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses, monthPrefix]
  );

  const budgetRatio = monthlyBudget && monthlyBudget > 0 ? monthTotal / monthlyBudget : null;
  const budgetTone = budgetRatio === null ? "neutral" : budgetRatio >= 1 ? "urgent" : budgetRatio >= 0.8 ? "warn" : "ok";

  const grouped = expenses.reduce((acc: Record<string, any[]>, e: any) => {
    const day = new Date(e.expense_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    acc[day] = acc[day] || [];
    acc[day].push(e);
    return acc;
  }, {});

  async function saveBudget() {
    const value = budgetInput.trim() === "" ? null : Number(budgetInput.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;

    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_budget: value }),
    });
    setBudgetOpen(false);
    mutate();
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    setEditing(null);
    mutate();
  }

  return (
    <div className="px-4 pt-6 space-y-5">
      <h1 className="text-xl font-semibold">Spese</h1>
      <p className="text-white/40 text-sm">
        Fotografa uno scontrino — leggiamo importo, negozio e categoria automaticamente, con la
        possibilità di correggerli se serve. Oppure inserisci una spesa a mano.
      </p>

      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/60">Questo mese</p>
          <button onClick={() => { setBudgetInput(monthlyBudget != null ? String(monthlyBudget) : ""); setBudgetOpen(true); }} className="text-xs text-white/40 hover:text-white/70">
            {monthlyBudget != null ? "Modifica budget" : "Imposta budget"}
          </button>
        </div>
        <p className="text-2xl font-semibold">
          € {formatEuro(monthTotal)}
          {monthlyBudget != null && <span className="text-white/30 text-base"> / € {formatEuro(monthlyBudget)}</span>}
        </p>
        {monthlyBudget != null && monthlyBudget > 0 && (
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full transition-all",
                budgetTone === "urgent" && "bg-urgent",
                budgetTone === "warn" && "bg-warn",
                budgetTone === "ok" && "bg-primary"
              )}
              style={{ width: `${Math.min(100, (budgetRatio ?? 0) * 100)}%` }}
            />
          </div>
        )}
        {budgetTone === "urgent" && <p className="text-urgent text-xs">Budget del mese superato.</p>}
        {budgetTone === "warn" && <p className="text-warn text-xs">Ti stai avvicinando al budget del mese.</p>}
      </div>

      {budgetOpen && (
        <div className="card space-y-3">
          <p className="text-sm text-white/60">Budget mensile totale</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="es. 800"
              className="input-field flex-1"
              autoFocus
            />
            <button onClick={saveBudget} className="btn-primary px-4">Salva</button>
            <button onClick={() => setBudgetOpen(false)} className="btn-ghost p-2.5" aria-label="Annulla">
              <X size={16} />
            </button>
          </div>
          <p className="text-[11px] text-white/35">Lascia vuoto e salva per rimuovere il budget impostato.</p>
        </div>
      )}

      <button onClick={() => setSheetOpen(true)} className="btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={18} />
        Aggiungi spesa
      </button>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="card h-16 animate-pulse bg-white/5" />)}
        </div>
      )}

      {!isLoading && expenses.length === 0 && (
        <div className="py-10 text-center space-y-2">
          <Receipt size={28} className="mx-auto text-white/20" />
          <p className="text-white/30 text-sm">Ancora nessuna spesa qui. Tocca il pulsante sopra per aggiungerne una.</p>
        </div>
      )}

      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wide">{day}</p>
          {(items as any[]).map((e) => (
            <button key={e.id} onClick={() => setEditing(e)} className="card w-full flex items-center gap-3 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{e.vendor || "Spesa"}</p>
                <p className="text-xs text-white/40">{CATEGORY_LABEL[e.category] ?? e.category}</p>
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">€ {formatEuro(Number(e.amount))}</span>
              <Pencil size={14} className="text-white/25 shrink-0" />
            </button>
          ))}
        </div>
      ))}

      <CaptureSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initialTab="image"
        allowedTabs={["image", "expense"]}
        expenseMode
      />

      {editing && (
        <ExpenseEditSheet
          expense={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); mutate(); }}
          onDelete={() => deleteExpense(editing.id)}
        />
      )}
    </div>
  );
}

function ExpenseEditSheet({
  expense,
  onClose,
  onSaved,
  onDelete,
}: {
  expense: any;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [vendor, setVendor] = useState(expense.vendor ?? "");
  const [amount, setAmount] = useState(String(expense.amount));
  const [category, setCategory] = useState(expense.category ?? "altro");
  const [date, setDate] = useState(expense.expense_date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsedAmount = Number(String(amount).replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Inserisci un importo valido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor: vendor.trim() || null, amount: parsedAmount, category, expense_date: date }),
      });
      if (!res.ok) throw new Error("save_failed");
      onSaved();
    } catch {
      setError("Salvataggio fallito. Controlla la connessione e riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full bg-surface rounded-t-3xl p-5 pb-8 animate-fade-in max-h-[80vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white/70">
            {expense.source === "photo" ? "Correggi la spesa letta dallo scontrino" : "Modifica spesa"}
          </p>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Negozio o esercizio (opzionale)"
          className="input-field w-full"
        />

        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field flex-1"
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field flex-1" />
        </div>

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

        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? "Salvataggio…" : "Salva"}
          </button>
          <button onClick={onDelete} className="btn-ghost p-2.5 text-urgent" aria-label="Elimina spesa">
            <Trash2 size={18} />
          </button>
        </div>
        {error && <p className="text-urgent text-sm">{error}</p>}
      </div>
    </div>
  );
}
