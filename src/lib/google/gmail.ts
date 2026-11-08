// Lettura Gmail via REST API diretta (nessuna dipendenza npm aggiuntiva:
// solo fetch) — stesso approccio minimale già usato nel resto del progetto
// per le altre integrazioni esterne.

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

export type ParsedEmail = {
  id: string;
  subject: string;
  from: string;
  dateHeader: string;
  bodyText: string;
};

/**
 * Elenca UNA pagina di id dei messaggi in arrivo (inbox) più recenti di
 * `afterUnixSeconds`, partendo da `pageToken` se presente. Il filtro
 * `after:` di Gmail lavora a granularità di giorno, non di secondo: per
 * questo il chiamante deve comunque scartare i messaggi già processati
 * (vedi processed_gmail_messages) invece di fidarsi ciecamente di questo
 * filtro.
 *
 * 2026-11-08: prima restituiva una sola pagina da 25 senza nextPageToken —
 * bastava per un sync incrementale ogni 5 minuti, ma un recupero
 * retroattivo dopo un'interruzione (vedi /api/integrations/google/callback)
 * può dover scorrere molte più email di 25: senza paginazione, last_synced_at
 * sarebbe comunque avanzato a fine giro lasciando perse in silenzio tutte
 * le email oltre la 25esima. Il chiamante (vedi /api/cron/gmail-sync) ora
 * scorre le pagine finché ce ne sono o finché non esaurisce il budget di
 * tempo del singolo giro cron.
 */
export async function listRecentMessageIds(
  accessToken: string,
  afterUnixSeconds: number,
  pageToken?: string
): Promise<{ messageIds: string[]; nextPageToken: string | null }> {  const q = `in:inbox after:${afterUnixSeconds}`;
  const params = new URLSearchParams({ q, maxResults: "50" });
  if (pageToken) params.set("pageToken", pageToken);

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Gmail messages.list fallita: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return {
    messageIds: (json.messages ?? []).map((m: { id: string }) => m.id),
    nextPageToken: json.nextPageToken ?? null,
  };
}

function base64UrlDecode(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBodyText(payload: GmailMessagePart): string {
  // Preferiamo text/plain quando c'è; altrimenti ripieghiamo su text/html
  // ripulito. Molte email di calendar/prenotazioni (Calendly, Google Meet,
  // Booking.com...) hanno entrambe le versioni nel multipart.
  let plain: string | null = null;
  let html: string | null = null;

  function walk(part: GmailMessagePart) {
    if (part.mimeType === "text/plain" && part.body?.data && !plain) {
      plain = base64UrlDecode(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data && !html) {
      html = base64UrlDecode(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);

  if (plain) return plain;
  if (html) return stripHtml(html);
  return "";
}

const MAX_BODY_CHARS = 6000; // sufficiente per il contesto rilevante, evita prompt enormi su email molto lunghe

export async function getMessage(accessToken: string, id: string): Promise<ParsedEmail> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Gmail messages.get fallita: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();

  const headers: { name: string; value: string }[] = json.payload?.headers ?? [];
  const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const bodyText = extractBodyText(json.payload ?? {}).slice(0, MAX_BODY_CHARS);

  return {
    id,
    subject: header("Subject"),
    from: header("From"),
    dateHeader: header("Date"),
    bodyText,
  };
}
