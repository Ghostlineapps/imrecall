// mammoth non pubblica dichiarazioni di tipo proprie (a differenza di
// xlsx e jszip, che le includono già nel pacchetto). Dichiarazione minima
// per evitare che TypeScript (strict + noImplicitAny) fallisca la build su
// Vercel — vedi src/lib/documents/extractText.ts, unico punto che lo usa.
declare module "mammoth" {
  interface ExtractRawTextInput {
    buffer?: Buffer;
    path?: string;
  }

  interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }

  function extractRawText(input: ExtractRawTextInput): Promise<ExtractRawTextResult>;

  const mammoth: {
    extractRawText: typeof extractRawText;
  };

  export default mammoth;
}
