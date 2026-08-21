import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonthRange(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// GET /api/expenses/export?from=YYYY-MM-DD&to=YYYY-MM-DD — dati per la
// "nota spese" stampabile (vedi /expenses/export). Non genera il PDF qui:
// il PDF nasce lato client con la stampa del browser (Salva come PDF), così
// non serve una libreria di generazione PDF sul server. Qui prepariamo solo
// i dati, incluse le foto degli scontrini (link firmati, brevi, generati al
// volo per l'occasione).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  const fallback = currentMonthRange();
  const from = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : fallback.from;
  const to = rawTo && DATE_RE.test(rawTo) ? rawTo : fallback.to;

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, vendor, amount, category, expense_date, source, memory_id, memories(media_path)")
    .eq("user_id", user.id)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Link firmati brevi (10 minuti) per le foto degli scontrini: quelli
  // salvati al momento del caricamento (media_url su memories) scadono
  // dopo un'ora e quasi sempre non sono più validi quando l'utente genera
  // la nota spese, magari giorni dopo.
  const rows = await Promise.all(
    (expenses ?? []).map(async (e: any) => {
      const mediaPath: string | null = e.memories?.media_path ?? null;
      let receiptUrl: string | null = null;
      if (mediaPath) {
        const { data: signed } = await supabase.storage.from("images").createSignedUrl(mediaPath, 600);
        receiptUrl = signed?.signedUrl ?? null;
      }
      return {
        id: e.id,
        vendor: e.vendor,
        amount: e.amount,
        category: e.category,
        expense_date: e.expense_date,
        source: e.source,
        receipt_url: receiptUrl,
      };
    })
  );

  const { data: profile } = await supabase.from("profiles").select("full_name, monthly_budget").eq("id", user.id).single();

  return NextResponse.json({
    expenses: rows,
    from,
    to,
    full_name: profile?.full_name ?? null,
    monthly_budget: profile?.monthly_budget ?? null,
  });
}
