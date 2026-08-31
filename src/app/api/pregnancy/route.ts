import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Voci di partenza per la checklist "Da preparare", create automaticamente
// quando l'utente imposta per la prima volta la data del parto — evita di
// far partire tutti da una lista vuota, restando comunque libera:
// l'utente può aggiungerne, toglierne o segnarle fatte come vuole.
const DEFAULT_CHECKLIST_ITEMS = [
  "Scegliere l'ospedale o il punto nascita",
  "Preparare la borsa per l'ospedale",
  "Scegliere il pediatra",
  "Organizzare la cameretta",
  "Corso pre-parto",
  "Documenti per il riconoscimento del neonato",
];

// Un solo record attivo per utente per ora: se in futuro servirà seguire
// più gravidanze nel tempo, si potrà aggiungere uno stato "archiviata"
// senza rompere questa API (prende sempre la più recente).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: pregnancy, error } = await supabase
    .from("pregnancies")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pregnancy) return NextResponse.json({ pregnancy: null });

  return NextResponse.json({ pregnancy: { ...pregnancy, ...computeProgress(pregnancy.due_date) } });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.due_date) return NextResponse.json({ error: "missing_due_date" }, { status: 400 });

  const { data: existing } = await supabase
    .from("pregnancies")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let pregnancy;

  if (existing) {
    const { data, error } = await supabase
      .from("pregnancies")
      .update({ due_date: body.due_date, notes: body.notes ?? null })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    pregnancy = data;
  } else {
    const { data, error } = await supabase
      .from("pregnancies")
      .insert({ user_id: user.id, due_date: body.due_date, notes: body.notes ?? null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    pregnancy = data;

    // Solo alla primissima creazione: se l'utente sta solo aggiornando la
    // data, la sua checklist esistente resta intatta.
    await supabase.from("pregnancy_checklist_items").insert(
      DEFAULT_CHECKLIST_ITEMS.map((label) => ({ user_id: user.id, label }))
    );
  }

  return NextResponse.json({ pregnancy: { ...pregnancy, ...computeProgress(pregnancy.due_date) } });
}

// 280 giorni (40 settimane) dal concepimento stimato è la convenzione
// standard usata per calcolare la data presunta del parto — la usiamo al
// contrario per stimare la settimana corrente a partire dalla due date.
function computeProgress(dueDateStr: string) {
  const due = new Date(dueDateStr);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / msPerDay);
  const daysPregnant = 280 - daysRemaining;
  const currentWeek = Math.max(1, Math.min(42, Math.floor(daysPregnant / 7) + 1));
  return { days_remaining: daysRemaining, current_week: currentWeek };
}
