import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/server";
import { nowInRome } from "@/lib/utils/romeTime";

// Chiamato ogni minuto da pg_cron DENTRO il database Supabase — stesso
// identico pattern di /api/cron/daily-capture-reminder (vedi quel file per
// il perché di pg_cron invece del cron di Vercel, impreciso sul piano
// Hobby): qui l'orario è fisso e uguale per tutti (le 7:30 del mattino a
// Roma), quindi 1439 delle 1440 chiamate al giorno escono subito senza
// fare nulla.
//
// A differenza del promemoria "hai catturato qualcosa oggi?" (che avvisa
// SOLO chi non ha ancora usato l'app), questo è un riassunto composto
// della giornata: appuntamenti di oggi + scadenze vicine + il miglior
// candidato di resurfacing non ancora mostrato. Notifica opt-in dedicata
// (migration 037), mai attiva di default, va accesa da Impostazioni →
// Notifiche — stesso principio di daily_capture_reminder_enabled, stesso
// motivo: chi attiva il push solo per farmaci/appuntamenti non deve
// ritrovarsi anche questa.
const BRIEFING_TIME_ROME = "07:30";

// Stessa conversione fuso orario duplicata in /api/upload/image,
// /api/upload/document, /api/upload/meeting, /api/cron/gmail-sync,
// /api/cron/outlook-sync e /api/cron/daily-capture-reminder — vedi
// commenti lì per il perché della duplicazione invece di condivisione. Qui
// serve solo per calcolare "mezzanotte di oggi/domani a Roma" come istanti
// UTC, per filtrare gli appuntamenti di oggi.
function romeLocalToUtcIso(localDateTime: string): string {
  const [datePart, timePart] = localDateTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);

  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = romeOffsetMinutesAt(guessUtcMs);
  return new Date(guessUtcMs - offsetMinutes * 60000).toISOString();
}

function romeOffsetMinutesAt(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs)).reduce((acc: Record<string, string>, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const romeAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (romeAsUtcMs - utcMs) / 60000;
}

// Aggiunge `days` a una data "YYYY-MM-DD" trattandola come data pura (non
// un istante): usiamo mezzogiorno UTC per evitare qualunque ambiguità da
// ora legale/solare sul cambio giorno.
function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

function formatRomeTime(isoUtc: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoUtc));
}

function daysUntil(todayStr: string, dueDateStr: string): number {
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = dueDateStr.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const dueMs = Date.UTC(dy, dm - 1, dd);
  return Math.round((dueMs - todayMs) / 86_400_000);
}

function labelForDaysUntil(days: number): string {
  if (days <= 0) return "scade oggi";
  if (days === 1) return "scade domani";
  return `scade tra ${days} giorni`;
}

const DEFAULT_RESURFACE_TYPES = ["on_this_day", "proximity", "pre_trip", "people", "deadline", "manual_recall"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.MORNING_BRIEFING_CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { date: today, time: nowTime } = nowInRome();
  if (nowTime !== BRIEFING_TIME_ROME) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const supabase = createServiceClient();

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, notification_types_enabled")
    .eq("morning_briefing_enabled", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const startOfTodayUtc = romeLocalToUtcIso(`${today}T00:00`);
  const startOfTomorrowUtc = romeLocalToUtcIso(`${addDaysToDateString(today, 1)}T00:00`);
  const deadlineWindowEnd = addDaysToDateString(today, 3);

  let sent = 0;
  let checked = 0;

  for (const u of users ?? []) {
    checked++;

    // Dedup: evita un secondo invio se pg_cron chiama più volte nello
    // stesso minuto — stesso pattern di daily_capture_reminder_logs.
    const { error: logError } = await supabase
      .from("morning_briefing_logs")
      .insert({ user_id: u.id, briefing_date: today });

    if (logError) {
      if (logError.code === "23505") continue; // già inviato oggi
      console.error("morning_briefing_logs insert fallito", logError);
      continue;
    }

    try {
      const [{ data: appointments }, { data: deadlines }, { data: candidates }] = await Promise.all([
        supabase
          .from("appointments")
          .select("title, appointment_at, location")
          .eq("user_id", u.id)
          .eq("completed", false)
          .gte("appointment_at", startOfTodayUtc)
          .lt("appointment_at", startOfTomorrowUtc)
          .order("appointment_at", { ascending: true }),
        supabase
          .from("deadlines")
          .select("title, due_date")
          .eq("user_id", u.id)
          .eq("completed", false)
          .gte("due_date", today)
          .lte("due_date", deadlineWindowEnd)
          .order("due_date", { ascending: true }),
        supabase
          .from("resurface_candidates")
          .select("title, body")
          .eq("user_id", u.id)
          .eq("sent", false)
          .eq("dismissed", false)
          .in("type", u.notification_types_enabled ?? DEFAULT_RESURFACE_TYPES)
          .order("priority_score", { ascending: false })
          .limit(1),
      ]);

      const lines: string[] = [];

      if (appointments && appointments.length > 0) {
        const items = appointments
          .slice(0, 3)
          .map((a) => `${formatRomeTime(a.appointment_at)} ${a.title}`)
          .join(", ");
        const label = appointments.length === 1 ? "Hai un appuntamento oggi" : `Hai ${appointments.length} appuntamenti oggi`;
        lines.push(`${label}: ${items}.`);
      }

      if (deadlines && deadlines.length > 0) {
        const items = deadlines
          .slice(0, 2)
          .map((d) => `'${d.title}' (${labelForDaysUntil(daysUntil(today, d.due_date))})`)
          .join(", ");
        lines.push(`Scadenze in arrivo: ${items}.`);
      }

      const candidate = candidates?.[0];
      if (candidate) {
        lines.push(candidate.body);
      }

      // Niente da dire = niente notifica: non ha senso mandare un
      // "buongiorno" vuoto, e sarebbe rumore per chi ha giornate tranquille
      // (stesso criterio di "non essere rumore" già seguito nel promemoria
      // cattura — vedi commento lì).
      if (lines.length === 0) continue;

      await sendPushToUser(u.id, {
        title: "Buongiorno! Ecco la tua giornata",
        body: lines.join(" "),
        url: "/",
      });
      sent++;
    } catch (err) {
      // Un fallimento su un utente non deve interrompere il briefing degli
      // altri — stesso principio già seguito in syncUserGmail.
      console.error(`Briefing mattutino fallito per utente ${u.id}`, err);
    }
  }

  return NextResponse.json({ success: true, checked, sent });
}
