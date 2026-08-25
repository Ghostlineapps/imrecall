import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google/client";
import { listRecentMessageIds, getMessage } from "@/lib/google/gmail";
import { createCalendarEvent } from "@/lib/google/calendar";
import { detectAppointmentFromEmail } from "@/lib/openai/emailAppointment";
import { sendPushToUser } from "@/lib/push/server";

// Chiamato periodicamente da pg_cron DENTRO il database Supabase (stesso
// meccanismo già in uso per /api/cron/medications — vedi BACKLOG.md),
// non dal cron di Vercel: sul piano Hobby gira al massimo una volta al
// giorno, troppo poco per email che arrivano in continuazione. Protetto da
// un secret dedicato, diverso da MEDICATION_CRON_SECRET.
//
// Per ogni utente collegato: legge le email nuove dall'ultimo sync, chiede
// a GPT-4o-mini se propongono una riunione/videocall/prenotazione, e se sì
// crea l'appuntamento in ImRecall + l'evento gemello su Google Calendar —
// stessa logica APPOINTMENT_DETECTED già in uso per foto/documenti/
// riunioni, applicata qui al testo delle email.

// Stessa conversione fuso orario duplicata in /api/upload/image,
// /api/upload/document e /api/upload/meeting — vedi commenti lì per il
// perché della duplicazione invece di condivisione.
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.GMAIL_CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: integrations, error } = await supabase.from("google_integrations").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let usersProcessed = 0;
  let appointmentsCreated = 0;

  for (const integration of integrations ?? []) {
    try {
      const created = await syncUserGmail(supabase, integration);
      usersProcessed += 1;
      appointmentsCreated += created;
    } catch (err) {
      // Un fallimento su un utente (es. token revocato da Google) non deve
      // interrompere il sync degli altri utenti in questo stesso giro.
      console.error(`Sync Gmail fallito per utente ${integration.user_id}`, err);
    }
  }

  return NextResponse.json({ usersProcessed, appointmentsCreated });
}

async function syncUserGmail(
  supabase: ReturnType<typeof createServiceClient>,
  integration: { user_id: string; last_synced_at: string | null }
): Promise<number> {
  const accessToken = await getValidAccessToken(integration.user_id);
  if (!accessToken) return 0;

  // Finestra con 10 minuti di margine rispetto all'ultimo sync: il filtro
  // `after:` di Gmail lavora a granularità di giorno, e comunque un margine
  // protegge da eventuali email arrivate proprio a cavallo tra due giri —
  // i duplicati veri e propri sono comunque scartati sotto via
  // processed_gmail_messages.
  const sinceUnix = integration.last_synced_at
    ? Math.floor(new Date(integration.last_synced_at).getTime() / 1000) - 600
    : Math.floor(Date.now() / 1000) - 3600;

  const messageIds = await listRecentMessageIds(accessToken, sinceUnix);

  const { data: alreadyProcessed } = await supabase
    .from("processed_gmail_messages")
    .select("gmail_message_id")
    .eq("user_id", integration.user_id)
    .in("gmail_message_id", messageIds.length ? messageIds : ["__none__"]);

  const processedIds = new Set((alreadyProcessed ?? []).map((r) => r.gmail_message_id));
  const newIds = messageIds.filter((id) => !processedIds.has(id));

  let created = 0;

  for (const id of newIds) {
    try {
      const email = await getMessage(accessToken, id);
      const detection = await detectAppointmentFromEmail(email);

      if (detection.is_appointment && detection.title && detection.appointment_at) {
        const startIso = romeLocalToUtcIso(detection.appointment_at);
        const endIso = new Date(
          new Date(startIso).getTime() + (detection.duration_minutes ?? 60) * 60000
        ).toISOString();

        let googleEventId: string | null = null;
        try {
          googleEventId = await createCalendarEvent(accessToken, {
            summary: detection.title,
            description: `Rilevato automaticamente da un'email (${email.subject}) da ImRecall.`,
            location: detection.location,
            startIso,
            endIso,
          });
        } catch (err) {
          console.error("Creazione evento Google Calendar fallita, l'appuntamento resta comunque salvato in ImRecall", err);
        }

        await supabase.from("appointments").insert({
          user_id: integration.user_id,
          title: detection.title,
          appointment_at: startIso,
          location: detection.location,
          source: "email",
          google_event_id: googleEventId,
        });

        created += 1;

        await sendPushToUser(integration.user_id, {
          title: "Nuovo appuntamento rilevato",
          body: detection.title,
          url: "/appointments",
        });
      }
    } catch (err) {
      console.error(`Elaborazione email ${id} fallita`, err);
      // continuiamo comunque con le altre email, ma NON marchiamo questa
      // come processata: verrà ritentata al prossimo giro (potrebbe essere
      // stato un errore transitorio dell'API Gmail o di OpenAI)
      continue;
    }

    await supabase.from("processed_gmail_messages").insert({
      user_id: integration.user_id,
      gmail_message_id: id,
    });
  }

  await supabase
    .from("google_integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", integration.user_id);

  return created;
}
