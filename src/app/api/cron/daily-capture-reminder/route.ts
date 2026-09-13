import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/server";
import { nowInRome } from "@/lib/utils/romeTime";

// Stessa conversione fuso orario duplicata in /api/upload/image,
// /api/upload/document, /api/upload/meeting e /api/cron/gmail-sync,
// /api/cron/outlook-sync — vedi commenti lì per il perché della
// duplicazione invece di condivisione. Qui serve solo per calcolare
// "mezzanotte di oggi a Roma", come istante UTC, per la query sotto.
function romeLocalToUtcIso(localDateTime: string): string {
const [datePart, timePart] = localDateTime.split("T");
const [year, month, day] = datePart.split("-").map(Number);
const [hour, minute] = (timePart ?? "09:00").split(":").map(Number);

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

// Chiamato ogni minuto da pg_cron DENTRO il database Supabase, stesso
// pattern di /api/cron/medications e /api/cron/appointments (vedi
// BACKLOG.md per il perché di pg_cron invece del cron di Vercel, impreciso
// sul piano Hobby). A differenza di quelle due route qui l'orario è fisso
// e uguale per tutti (le 9 del mattino a Roma): la finestra di invio è un
// singolo minuto al giorno, le altre 1439 chiamate escono subito senza
// fare nulla.
//
// Notifica opt-in (migration 036) — mai attiva di default, va accesa da
// Impostazioni → Notifiche — e inviata SOLO a chi non ha ancora catturato
// nulla quella mattina, per non essere rumore a chi ha già usato l'app.
export async function GET(req: NextRequest) {
const authHeader = req.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.DAILY_CAPTURE_REMINDER_CRON_SECRET}`) {
return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

const { date: today, time: nowTime } = nowInRome();
if (nowTime !== "09:00") {
return NextResponse.json({ success: true, skipped: true });
}

const supabase = createServiceClient();

const { data: users, error } = await supabase
.from("profiles")
.select("id")
.eq("daily_capture_reminder_enabled", true);

if (error) return NextResponse.json({ error: error.message }, { status: 500 });

const startOfTodayUtc = romeLocalToUtcIso(`${today}T00:00`);
let sent = 0;

for (const u of users ?? []) {
// Dedup: evita un secondo invio se pg_cron chiama più volte nello
// stesso minuto — stesso motivo del controllo su notified_at nel cron
// farmaci, qui realizzato con un vincolo unique su (user_id,
// reminder_date) invece che con un update idempotente, dato che qui
// non c'è nessuna riga preesistente da aggiornare.
const { error: logError } = await supabase
.from("daily_capture_reminder_logs")
.insert({ user_id: u.id, reminder_date: today });

if (logError) {
if (logError.code === "23505") continue; // già inviato oggi
console.error("daily_capture_reminder_logs insert fallito", logError);
continue;
}

// Non ha senso ricordare di catturare qualcosa a chi lo ha già fatto
// stamattina — salta se esiste già una memoria non cancellata creata
// da mezzanotte (fuso Roma) a adesso.
const { count } = await supabase
.from("memories")
.select("id", { count: "exact", head: true })
.eq("user_id", u.id)
.is("deleted_at", null)
.gte("created_at", startOfTodayUtc);

if (count && count > 0) continue;

await sendPushToUser(u.id, {
title: "Pronta la giornata da ricordare?",
body: "Un momento, una foto, un pensiero: bastano pochi secondi per fissarlo.",
url: "/",
});
sent++;
}

return NextResponse.json({ success: true, checked: users?.length ?? 0, sent });
}
