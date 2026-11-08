export type ParsedEmail = {
  id: string;
  subject: string;
  from: string;
  dateHeader: string;
  bodyText: string;
};

const MAX_BODY_CHARS = 6000;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Elenca UNA pagina degli ID dei messaggi arrivati in inbox dopo
// `afterUnixSeconds` (o dalla pagina successiva via `nextLink`) — stessa
// idea di listRecentMessageIds in src/lib/google/gmail.ts, ma via Microsoft
// Graph invece delle API Gmail. Paginazione aggiunta 2026-11-08 per lo
// stesso motivo del gemello Gmail: un recupero dopo un'interruzione
// (migrazione 039) può superare abbondantemente i 50 risultati di una
// singola pagina.
export async function listRecentMessageIds(
  accessToken: string,
  afterUnixSeconds: number,
  nextLink?: string
): Promise<{ messageIds: string[]; nextLink: string | null }> {
  const afterIso = new Date(afterUnixSeconds * 1000).toISOString();
  const url =
    nextLink ??
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${afterIso}&$select=id&$top=50&$orderby=receivedDateTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { messageIds: [], nextLink: null };

  const data = await res.json();
  return {
    messageIds: (data.value ?? []).map((m: { id: string }) => m.id),
    nextLink: data["@odata.nextLink"] ?? null,
  };
}

export async function getMessage(accessToken: string, id: string): Promise<ParsedEmail> {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=subject,from,receivedDateTime,body,bodyPreview`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();

  const bodyContent: string = data.body?.content ?? data.bodyPreview ?? "";
  const bodyText = (data.body?.contentType === "html" ? stripHtml(bodyContent) : bodyContent).slice(
    0,
    MAX_BODY_CHARS
  );

  return {
    id,
    subject: data.subject ?? "",
    from: data.from?.emailAddress?.address ?? data.from?.emailAddress?.name ?? "",
    dateHeader: data.receivedDateTime ?? "",
    bodyText,
  };
}
