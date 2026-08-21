"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, X } from "lucide-react";
import Link from "next/link";

const CATEGORY_LABEL: Record<string, string> = {
  spesa: "Spesa",
  trasporti: "Trasporti",
  ristorazione: "Ristorazione",
  casa: "Casa",
  salute: "Salute",
  svago: "Svago",
  altro: "Altro",
};

type ExportExpense = {
  id: string;
  vendor: string | null;
  amount: number;
  category: string;
  expense_date: string;
  source: string;
  receipt_url: string | null;
};

function formatEuro(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateIt(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function isFullCalendarMonth(from: string, to: string): boolean {
  const f = new Date(from);
  const lastDay = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  return f.getDate() === 1 && to === `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

// Nota spese stampabile (/expenses/export?from=YYYY-MM-DD&to=YYYY-MM-DD),
// incluse le foto degli scontrini. Non generiamo un PDF sul server: la
// pagina è pensata per la stampa del browser ("Salva come PDF" nella
// finestra di stampa produce un PDF vero, senza bisogno di librerie
// aggiuntive) — funziona anche per stampare su carta o condividere la
// pagina così com'è.
function ExportReport() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const [data, setData] = useState<{
    expenses: ExportExpense[];
    from: string;
    to: string;
    full_name: string | null;
    monthly_budget: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/expenses/export?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Impossibile caricare la nota spese. Controlla la connessione e riprova."));
  }, [from, to]);

  const totals = useMemo(() => {
    if (!data) return { grand: 0, byCategory: {} as Record<string, number> };
    const byCategory: Record<string, number> = {};
    let grand = 0;
    for (const e of data.expenses) {
      const amt = Number(e.amount);
      grand += amt;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
    }
    return { grand, byCategory };
  }, [data]);

  const withReceipt = useMemo(() => (data ? data.expenses.filter((e) => e.receipt_url) : []), [data]);

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Link href="/expenses" className="text-sm underline">
          Torna a Spese
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center text-black/50 text-sm">Preparazione della nota spese…</div>;
  }

  const showBudget = data.monthly_budget != null && isFullCalendarMonth(data.from, data.to);

  return (
    <div className="max-w-[800px] mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          .no-print { display: none !important; }
          .receipt-card { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between gap-3 bg-white/95 backdrop-blur px-6 py-3 border-b border-black/10">
        <Link href="/expenses" className="flex items-center gap-1.5 text-sm text-black/60 hover:text-black">
          <X size={16} /> Chiudi
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-black/80"
        >
          <Printer size={16} />
          Stampa / Salva come PDF
        </button>
      </div>
      <p className="no-print text-xs text-black/40 -mt-3 mb-6">
        Per scaricare o condividere un file PDF, scegli “Salva come PDF” come destinazione nella finestra di stampa.
      </p>

      <header className="mb-6 space-y-1">
        <p className="text-xs uppercase tracking-wide text-black/40">IMRECALL — Nota spese</p>
        <h1 className="text-2xl font-semibold">
          {formatDateIt(data.from)} — {formatDateIt(data.to)}
        </h1>
        {data.full_name && <p className="text-sm text-black/50">{data.full_name}</p>}
        <p className="text-xs text-black/30">
          Generata il {formatDateIt(new Date().toISOString().slice(0, 10))}
        </p>
      </header>

      <section className="mb-8 border border-black/10 rounded-xl p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-black/50">Totale periodo</p>
          <p className="text-xl font-semibold">€ {formatEuro(totals.grand)}</p>
        </div>
        {showBudget && (
          <div className="flex items-baseline justify-between text-sm text-black/50">
            <p>Budget mensile</p>
            <p>
              € {formatEuro(totals.grand)} / € {formatEuro(data.monthly_budget as number)}
            </p>
          </div>
        )}
        <div className="pt-2 border-t border-black/10 space-y-1">
          {Object.entries(totals.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <p className="text-black/60">{CATEGORY_LABEL[cat] ?? cat}</p>
                <p>€ {formatEuro(amt)}</p>
              </div>
            ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/40 mb-2">Dettaglio spese</h2>
        {data.expenses.length === 0 ? (
          <p className="text-sm text-black/40">Nessuna spesa registrata in questo periodo.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-black/40 border-b border-black/10">
                <th className="py-1.5 pr-2 font-medium">Data</th>
                <th className="py-1.5 pr-2 font-medium">Negozio</th>
                <th className="py-1.5 pr-2 font-medium">Categoria</th>
                <th className="py-1.5 pr-2 font-medium text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((e) => (
                <tr key={e.id} className="border-b border-black/5">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatDateIt(e.expense_date)}</td>
                  <td className="py-1.5 pr-2">
                    {e.vendor || "—"} {e.receipt_url && <span className="text-black/30">📷</span>}
                  </td>
                  <td className="py-1.5 pr-2">{CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">€ {formatEuro(Number(e.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {withReceipt.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/40 mb-3">
            Scontrini fotografati ({withReceipt.length})
          </h2>
          <div className="grid grid-cols-2 gap-4 print:grid-cols-2">
            {withReceipt.map((e) => (
              <div key={e.id} className="receipt-card border border-black/10 rounded-lg p-2 space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.receipt_url ?? undefined} alt="" className="w-full max-h-[420px] object-contain rounded" />
                <p className="text-xs text-black/50 text-center">
                  {formatDateIt(e.expense_date)} · {e.vendor || CATEGORY_LABEL[e.category]} · € {formatEuro(Number(e.amount))}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ExpensesExportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-black/50 text-sm">Caricamento…</div>}>
      <ExportReport />
    </Suspense>
  );
}
