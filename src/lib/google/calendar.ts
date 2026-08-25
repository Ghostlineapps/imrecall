// Creazione eventi su Google Calendar via REST diretta, stesso approccio
// "solo fetch" di src/lib/google/gmail.ts.

export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string | null;
    location?: string | null;
    startIso: string; // UTC ISO, es. da romeLocalToUtcIso()
    endIso: string;
  }
): Promise<string | null> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        start: { dateTime: event.startIso },
        end: { dateTime: event.endIso },
        // ImRecall gestisce già i suoi promemoria (push/email); l'evento su
        // Calendar è per la visibilità nell'agenda, non aggiunge notifiche
        // duplicate.
        reminders: { useDefault: false },
      }),
    }
  );

  if (!res.ok) {
    console.error("Google Calendar events.insert fallita", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  return json.id ?? null;
}
