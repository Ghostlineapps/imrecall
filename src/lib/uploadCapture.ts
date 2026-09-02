// src/lib/uploadCapture.ts
//
// Upload di una registrazione (nota vocale o riunione) verso il server,
// con distinzione esplicita tra errori PERMANENTI (il server ha rifiutato
// il file in modo definitivo, es. limite mensile superato — ritentare è
// inutile) ed errori TRANSITORI (rete assente/instabile, timeout — vale
// la pena ritentare più tardi, vedi src/stores/captureQueueStore.ts).
//
// Questo file non tocca la coda offline (src/lib/offlineQueue.ts): si
// occupa solo del singolo tentativo di upload verso /api/upload/*.

import type { PendingCaptureKind } from "./offlineQueue";

const ENDPOINTS: Record<PendingCaptureKind, string> = {
  audio: "/api/upload/audio",
  meeting: "/api/upload/meeting",
};

const FIELD_NAMES: Record<PendingCaptureKind, string> = {
  audio: "recording.webm",
  meeting: "meeting.webm",
};

// Codici di errore per cui ritentare è inutile: il server ha già deciso
// che questo file non verrà mai accettato (limite di piano, file troppo
// grande...). In questi casi la registrazione va tolta dalla coda invece
// di restare lì a fallire per sempre.
const PERMANENT_ERROR_CODES = new Set([
  "duration_exceeded",
  "monthly_minutes_exceeded",
  "limit_reached",
  "file_too_large",
]);

export class UploadError extends Error {
  /** true = non ritentare (limite superato ecc.), false = errore di rete/temporaneo */
  permanent: boolean;
  /** messaggio pronto per essere mostrato all'utente, in italiano */
  userMessage: string;

  constructor(code: string, permanent: boolean, userMessage: string) {
    super(code);
    this.name = "UploadError";
    this.permanent = permanent;
    this.userMessage = userMessage;
  }
}

function describeErrorCode(code: string, data: Record<string, unknown>): string {
  switch (code) {
    case "duration_exceeded": {
      const maxMin = Math.round((Number(data.max) || 0) / 60);
      return `Registrazione troppo lunga per il tuo piano (massimo ${maxMin} minuti).`;
    }
    case "monthly_minutes_exceeded":
      return `Hai esaurito i minuti di trascrizione di questo mese (${data.max_minutes ?? "?"} min). Riprova il mese prossimo o passa a un piano superiore.`;
    case "limit_reached":
      return `Hai raggiunto il limite di ${data.limit ?? "?"} memorie questo mese.`;
    case "file_too_large":
      return `File troppo grande (massimo ${data.max_mb ?? "?"} MB).`;
    default:
      return "Caricamento fallito. Controlla la connessione e riprova.";
  }
}

/**
 * Prova a caricare una registrazione. Lancia sempre un UploadError in caso
 * di fallimento (mai un errore "grezzo"), così chi chiama può decidere in
 * modo uniforme se ritentare (permanent === false) o no.
 */
export async function uploadCapture(
  kind: PendingCaptureKind,
  blob: Blob,
  duration: number
): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append("file", blob, FIELD_NAMES[kind]);
  formData.append("duration", String(duration));

  let res: Response;
  try {
    res = await fetch(ENDPOINTS[kind], { method: "POST", body: formData });
  } catch {
    throw new UploadError(
      "network_error",
      false,
      "Connessione assente o instabile: la registrazione resta salvata e verrà caricata appena possibile."
    );
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const code = typeof data?.error === "string" ? data.error : "upload_failed";
    const permanent = PERMANENT_ERROR_CODES.has(code);
    throw new UploadError(code, permanent, describeErrorCode(code, data));
  }

  return res.json().catch(() => ({}));
}
