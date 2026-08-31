import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/server";

// Chiamato ogni minuto da pg_cron DENTRO il database Supabase, stesso
// identico pattern del cron dei farmaci (vedi src/app/api/cron/medications
// e il job pg_cron documentato in BACKLOG.md) — non dal cron di Vercel, che
// sul piano Hobby gira al massimo una volta al giorno.
//
// Ogni appuntamento ha reminder_minutes_before (int[], es. [1440, 60]):
// "avvisami 1440 minuti [1 giorno] e 60 minuti [1 ora] prima". Per ogni
// appuntamento futuro e ogni offset configurato calcoliamo l'istante esatto
// del promemoria (appointment_at - offset) e controlliamo se cade nel
// minuto corrente. Confronto fatto su timestamp assoluti (ms), non su
// orario "a muro" Europe/Rome come nel cron farmaci: appointment_at è già
// un timestamptz, quindi il confronto è indipendente dal fuso del server.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.APPOINTMENT_CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const nowMinuteMs = Math.floor(now.getTime() / 60000) * 60000;

  // Finestra ampia (30 giorni) per coprire anche promemoria impostati con
  // largo anticipo: filtriamo qui solo per tenere la query leggera, il
  // controllo "è questo il minuto giusto?" avviene sotto in JS perché ogni
  // appuntamento può avere più offset diversi nello stesso array.
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id, user_id, title, appointment_at, location, reminder_minutes_before, memory_id")
    .eq("completed", false)
    .gte("appointment_at", now.toISOString())
    .lte("appointment_at", windowEnd);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let checked = 0;

  for (const a of appointments ?? []) {
    const apptMs = new Date(a.appointment_at).getTime();
    const offsets: number[] = Array.isArray(a.reminder_minutes_before) ? a.reminder_minutes_before : [];

    for (const offsetMinutes of offsets) {
      checked++;
      const targetMinuteMs = Math.floor((apptMs - offsetMinutes * 60000) / 60000) * 60000;
      if (targetMinuteMs !== nowMinuteMs) continue;

      // Evita reinvii se pg_cron chiama più volte nello stesso minuto —
      // stesso pattern di medication_logs, ma qui la chiave è
      // (appointment_id, offset_minutes) invece che (medication_id, data,
      // orario), dato che un appuntamento non si ripete mai due volte.
      const { error: logError } = await supabase.from("appointment_reminder_logs").insert({
        appointment_id: a.id,
        user_id: a.user_id,
        offset_minutes: offsetMinutes,
      });

      // Violazione del vincolo unique = promemoria già inviato per questo
      // appuntamento+offset, salta senza errore.
      if (logError) {
        if (logError.code === "23505") continue;
        console.error("appointment_reminder_logs insert fallito", logError);
        continue;
      }

      await sendPushToUser(a.user_id, {
        title: `${labelForOffset(offsetMinutes)}: ${a.title}`,
        body: a.location ?? "",
        url: a.memory_id ? `/memory/${a.memory_id}` : "/appointments",
      });
      sent++;
    }
  }

  return NextResponse.json({ success: true, checked, sent });
}

function labelForOffset(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "Domani" : `Tra ${days} giorni`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Tra un'ora" : `Tra ${hours} ore`;
  }
  return `Tra ${minutes} minuti`;
}
