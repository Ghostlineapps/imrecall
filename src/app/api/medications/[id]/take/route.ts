import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nowInRome } from "@/lib/utils/romeTime";

// Segna (o toglie il segno da) una dose specifica come presa. Crea la riga
// in medication_logs se non esiste già — così funziona sia se l'utente
// spunta dopo la notifica push (log già creato dal cron con notified_at)
// sia se la spunta prima che arrivi la notifica (nessun log ancora).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const time = body?.time as string | undefined;
  if (!time) return NextResponse.json({ error: "time_required" }, { status: 400 });

  const date = (body?.date as string | undefined) ?? nowInRome().date;
  const taken = body?.taken !== false; // default: segna come presa

  const { data: medication } = await supabase
    .from("medications")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!medication) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await supabase
    .from("medication_logs")
    .upsert(
      {
        medication_id: params.id,
        user_id: user.id,
        log_date: date,
        scheduled_time: time,
        taken_at: taken ? new Date().toISOString() : null,
      },
      { onConflict: "medication_id,log_date,scheduled_time" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
