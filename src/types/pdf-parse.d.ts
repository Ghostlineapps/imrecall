// pdf-parse non pubblica dichiarazioni di tipo proprie. Dichiarazione
// minima per evitare che TypeScript (strict + noImplicitAny) fallisca la
// build su Vercel con "implicitly has an 'any' type" — vedi
// src/lib/documents/extractText.ts, unico punto che lo importa.
declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;

  export default pdfParse;
}
