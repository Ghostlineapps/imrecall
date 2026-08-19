import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/server";
import { nowInRome } from "@/lib/utils/romeTime";

// Chiamato ogni minuto da pg_cron DENTRO il database Supabase — non dal
// cron di Vercel, che sul piano Hobby può girare al massimo una volta al
// giorno con ±59 minuti di margine (troppo poco per un promemoria puntuale
// più volte al giorno). Vedi il job pg_cron documentato in BACKLOG.md.
// Protetto da un secret dedicato (MEDICATION_CRON_SECRET), diverso dal
// CRON_SECRET che Vercel genera per i propri cron interni — questo viene
// chiamato dall'esterno (da Supabase), non da Vercel stesso.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.MEDICATION_CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { date: today, time: nowTime } = nowInRome();

  const { data: medications, error } = await supabase
    .from("medications")
    .select("*")
    .eq("active", true)
    .contains("times", [nowTime]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;

  for (const m of medications ?? []) {
    // Evita reinvii se pg_cron chiama più volte nello stesso minuto (o con
    // un piccolo ritardo che fa ricadere due invocazioni sullo stesso
    // orario di promemoria).
    const { data: existing } = await supabase
      .from("medication_logs")
      .select("id, notified_at")
      .eq("medication_id", m.id)
      .eq("log_date", today)
      .eq("scheduled_time", nowTime)
      .maybeSingle();

    if (existing?.notified_at) continue;

    if (existing) {
      await supabase
        .from("medication_logs")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("medication_logs").insert({
        medication_id: m.id,
        user_id: m.user_id,
        log_date: today,
        scheduled_time: nowTime,
        notified_at: new Date().toISOString(),
      });
    }

    // Il nome del farmaco va nel titolo stesso della notifica ("Prendi il
    // Bivis"), non in un testo generico — così chi ne prende più di uno non
    // rischia di confonderli, richiesta esplicita per l'uso con pazienti
    // anziani.
    await sendPushToUser(m.user_id, {
      title: `Prendi il ${m.name}`,
      body: m.dose ?? "",
      url: m.memory_id ? `/memory/${m.memory_id}` : "/timeline",
    });
    sent++;
  }

  return NextResponse.json({ success: true, checked: medications?.length ?? 0, sent });
}
