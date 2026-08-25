// Stessa idea di src/lib/google/calendar.ts: crea l'evento gemello, questa
// volta sul Calendar di Outlook via Microsoft Graph. Non solleva mai
// un'eccezione verso il chiamante: se la creazione fallisce, l'appuntamento
// resta comunque salvato in ImRecall (stessa scelta fatta per Google).
export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string | null;
    location?: string | null;
    startIso: string;
    endIso: string;
  }
): Promise<string | null> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: event.summary,
        body: { contentType: "text", content: event.description ?? "" },
        start: { dateTime: event.startIso, timeZone: "UTC" },
        end: { dateTime: event.endIso, timeZone: "UTC" },
        location: event.location ? { displayName: event.location } : undefined,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}
