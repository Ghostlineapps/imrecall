import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/microsoft/client";
import { listRecentMessageIds, getMessage } from "@/lib/microsoft/mail";
import { createCalendarEvent } from "@/lib/microsoft/calendar";
import { detectAppointmentFromEmail } from "@/lib/openai/emailAppointment";
import { sendPushToUser } from "@/lib/push/server";

// Gemello di /api/cron/gmail-sync per Outlook/Microsoft — stesso meccanismo
// pg_cron, stesso rilevamento GPT-4o-mini (funzione condivisa, non serve
// duplicarla: prende in input {subject, from, dateHeader, bodyText},
// indipendente dal provider email), stessa logica di dedup. Protetto da
// OUTLOOK_CRON_SECRET, dedicato e diverso sia da MEDICATION_CRON_SECRET sia
// da GMAIL_CRON_SECRET.

// Stessa conversione fuso orario duplicata in tutte le altre route cron —
// vedi commenti lì per il perché della duplicazione invece di condivisione.
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
  if (authHeader !== `Bearer ${process.env.OUTLOOK_CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: integrations, error } = await supabase.from("microsoft_integrations").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let usersProcessed = 0;
  let appointmentsCreated = 0;

  for (const integration of integrations ?? []) {
    try {
      const created = await syncUserOutlook(supabase, integration);
      usersProcessed += 1;
      appointmentsCreated += created;
    } catch (err) {
      // Un fallimento su un utente (es. token revocato da Microsoft) non
      // deve interrompere il sync degli altri utenti in questo stesso giro.
      console.error(`Sync Outlook fallito per utente ${integration.user_id}`, err);
    }
  }

  return NextResponse.json({ usersProcessed, appointmentsCreated });
}

async function syncUserOutlook(
  supabase: ReturnType<typeof createServiceClient>,
  integration: { user_id: string; last_synced_at: string | null }
): Promise<number> {
  const accessToken = await getValidAccessToken(integration.user_id);
  if (!accessToken) return 0;

  // Stesso margine di 10 minuti usato per Gmail — vedi commenti lì.
  const sinceUnix = integration.last_synced_at
    ? Math.floor(new Date(integration.last_synced_at).getTime() / 1000) - 600
    : Math.floor(Date.now() / 1000) - 3600;

  const messageIds = await listRecentMessageIds(accessToken, sinceUnix);

  const { data: alreadyProcessed } = await supabase
    .from("processed_outlook_messages")
    .select("outlook_message_id")
    .eq("user_id", integration.user_id)
    .in("outlook_message_id", messageIds.length ? messageIds : ["__none__"]);

  const processedIds = new Set((alreadyProcessed ?? []).map((r) => r.outlook_message_id));
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

        let microsoftEventId: string | null = null;
        try {
          microsoftEventId = await createCalendarEvent(accessToken, {
            summary: detection.title,
            description: `Rilevato automaticamente da un'email (${email.subject}) da ImRecall.`,
            location: detection.location,
            startIso,
            endIso,
          });
        } catch (err) {
          console.error(
            "Creazione evento Outlook Calendar fallita, l'appuntamento resta comunque salvato in ImRecall",
            err
          );
        }

        await supabase.from("appointments").insert({
          user_id: integration.user_id,
          title: detection.title,
          appointment_at: startIso,
          location: detection.location,
          source: "email",
          microsoft_event_id: microsoftEventId,
        });

        created += 1;

        await sendPushToUser(integration.user_id, {
          title: "Nuovo appuntamento rilevato",
          body: detection.title,
          url: "/appointments",
        });
      }
    } catch (err) {
      console.error(`Elaborazione email Outlook ${id} fallita`, err);
      // continuiamo comunque con le altre email, ma NON marchiamo questa
      // come processata: verrà ritentata al prossimo giro
      continue;
    }

    await supabase.from("processed_outlook_messages").insert({
      user_id: integration.user_id,
      outlook_message_id: id,
    });
  }

  await supabase
    .from("microsoft_integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", integration.user_id);

  return created;
}
