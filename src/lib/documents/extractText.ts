// Estrazione testo da file caricati tramite /api/upload/document. Al
// momento supporta PDF (via pdf-parse) e file di puro testo (txt/csv/md).
// Word/Excel/PowerPoint sono previsti come prossimo step (mammoth/xlsx/
// jszip) — vedi BACKLOG.md: li aggiungiamo in un secondo momento, verificato
// singolarmente sul deploy reale, per isolare eventuali problemi di build
// legati a una nuova dipendenza invece di introdurne tre insieme.

export type ExtractResult = {
  text: string;
  kind: "pdf" | "txt" | "csv" | "unsupported";
};

function extFromName(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export async function extractDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ExtractResult> {
  const ext = extFromName(fileName);

  if (ext === "pdf" || mimeType === "application/pdf") {
    // pdf-parse non ha bisogno di canvas/rendering: legge direttamente il
    // layer di testo del PDF. Funziona bene per PDF "testuali" (fatture,
    // biglietti, contratti esportati digitalmente); un PDF che è in realtà
    // una scansione fotografata (nessun layer di testo) restituirà una
    // stringa vuota o quasi — gestito più sotto nella route con un
    // messaggio esplicito invece di salvare un ricordo vuoto in silenzio.
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return { text: data.text ?? "", kind: "pdf" };
  }

  if (ext === "csv" || mimeType === "text/csv") {
    return { text: buffer.toString("utf-8"), kind: "csv" };
  }

  if (ext === "txt" || ext === "md" || mimeType.startsWith("text/")) {
    return { text: buffer.toString("utf-8"), kind: "txt" };
  }

  return { text: "", kind: "unsupported" };
}
