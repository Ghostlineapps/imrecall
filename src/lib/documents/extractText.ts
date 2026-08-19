// Estrazione testo da file caricati tramite /api/upload/document. Supporta
// PDF (pdf-parse), testo puro (txt/csv/md), Word (mammoth), Excel
// (xlsx/SheetJS) e PowerPoint (jszip + parsing manuale dell'XML delle
// slide — un .pptx è semplicemente uno zip di file XML, non esiste una
// libreria "diretta" comoda quanto le altre per questo formato).

export type ExtractResult = {
  text: string;
  kind: "pdf" | "txt" | "csv" | "docx" | "xlsx" | "pptx" | "unsupported";
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

  if (
    ext === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value ?? "", kind: "docx" };
  }

  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetsText = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `--- ${name} ---\n${csv}`;
    }).join("\n\n");
    return { text: sheetsText, kind: "xlsx" };
  }

  if (
    ext === "pptx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    // Un .pptx è uno zip: il testo di ogni slide vive in
    // ppt/slides/slideN.xml dentro tag <a:t>...</a:t>. Niente rendering,
    // solo estrazione testuale grezza — coerente con l'approccio "solo
    // testo" usato per gli altri formati.
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
        const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
        return na - nb;
      });

    const slideTexts: string[] = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async("text");
      const matches = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)];
      const text = matches.map((m) => m[1]).join(" ");
      if (text.trim()) slideTexts.push(text.trim());
    }

    return { text: slideTexts.join("\n\n"), kind: "pptx" };
  }

  if (ext === "csv" || mimeType === "text/csv") {
    return { text: buffer.toString("utf-8"), kind: "csv" };
  }

  if (ext === "txt" || ext === "md" || mimeType.startsWith("text/")) {
    return { text: buffer.toString("utf-8"), kind: "txt" };
  }

  return { text: "", kind: "unsupported" };
}
