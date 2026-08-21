import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["spesa", "trasporti", "ristorazione", "casa", "salute", "svago", "altro"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/expenses — lista delle spese dell'utente, più recenti prima.
// Il totale del mese corrente lo calcoliamo lato client (vedi /expenses
// page): qui torniamo semplicemente tutte le righe, senza paginazione —
// coerente con /api/deadlines e /api/appointments, che fanno lo stesso.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", user.id)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_budget")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ expenses: expenses ?? [], monthly_budget: profile?.monthly_budget ?? null });
}

// POST /api/expenses — inserimento manuale (tab "Spesa" della cattura),
// senza passare per una foto/OCR. Usato anche per correggere in blocco se
// in futuro servisse, ma oggi la correzione di una lettura sbagliata dallo
// scontrino passa dal PATCH su /api/expenses/[id] (vedi pagina /expenses).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const category = CATEGORIES.includes(body.category) ? body.category : "altro";
  const expense_date = DATE_RE.test(body.expense_date) ? body.expense_date : new Date().toISOString().slice(0, 10);
  const vendor = typeof body.vendor === "string" ? body.vendor.trim().slice(0, 200) || null : null;

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      vendor,
      amount,
      category,
      expense_date,
      source: "manual",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
