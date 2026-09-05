import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recalculateCyclePeriods } from "@/lib/cycle/recalculate";
import { FLOW_OPTIONS, MOOD_OPTIONS, SYMPTOM_OPTIONS } from "@/lib/cycle/predictions";

const FLOW_SET = new Set<string>(FLOW_OPTIONS);
const SYMPTOM_SET = new Set<string>(SYMPTOM_OPTIONS);
const MOOD_SET = new Set<string>(MOOD_OPTIONS);

/** Log del ciclo in un intervallo di date, per il calendario mensile. Senza
 * from/to, ritorna gli ultimi ~4 mesi — abbastanza per il primo caricamento
 * della pagina senza scaricare anni di cronologia inutilmente. */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("cycle_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("log_date", { ascending: false });

  if (from) query = query.gte("log_date", from);
  if (to) query = query.lte("log_date", to);
  if (!from && !to) query = query.limit(120);

  const { data: logs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: logs ?? [] });
}

/** Upsert del log di un giorno (flusso/sintomi/umore/temperatura/note) —
 * un giorno può avere sintomi/umore anche senza flusso, quindi non basta
 * "c'è flow" per considerare valido il salvataggio. Dopo ogni scrittura
 * ricalcola periodi e medie (vedi recalculateCyclePeriods): il costo di
 * ricalcolare tutto ad ogni log è trascurabile per un utente singolo, ed
 * evita casi limite di un aggiornamento incrementale. */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const log_date = typeof body?.log_date === "string" ? body.log_date : null;
  if (!log_date || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
    return NextResponse.json({ error: "invalid_log_date" }, { status: 400 });
  }

  const flow = typeof body?.flow === "string" && FLOW_SET.has(body.flow) ? body.flow : null;
  const symptoms = Array.isArray(body?.symptoms)
    ? body.symptoms.filter((s: unknown): s is string => typeof s === "string" && SYMPTOM_SET.has(s))
    : [];
  const mood = Array.isArray(body?.mood)
    ? body.mood.filter((m: unknown): m is string => typeof m === "string" && MOOD_SET.has(m))
    : [];
  const basal_temp =
    typeof body?.basal_temp === "number" && body.basal_temp > 30 && body.basal_temp < 43 ? body.basal_temp : null;
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 2000) : null;

  const { data: log, error } = await supabase
    .from("cycle_logs")
    .upsert(
      {
        user_id: user.id,
        log_date,
        flow,
        symptoms,
        mood,
        basal_temp,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,log_date" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalculateCyclePeriods(supabase, user.id).catch((err) =>
    console.error("recalculateCyclePeriods failed", err)
  );

  return NextResponse.json({ log });
}
