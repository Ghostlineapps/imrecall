// src/lib/uploadCapture.ts
//
// Upload di una registrazione (nota vocale o riunione) verso il server,
// con distinzione esplicita tra errori PERMANENTI (il server ha rifiutato
// il file in modo definitivo, es. limite mensile superato — ritentare è
// inutile) ed errori TRANSITORI (rete assente/instabile, timeout — vale
// la pena ritentare più tardi, vedi src/stores/captureQueueStore.ts).
//
// 2026-09-17: RISCRITTO — prima il blob veniva inviato dentro il corpo di
// una singola richiesta POST /api/upload/{kind} (multipart/form-data). Le
// funzioni serverless di Vercel impongono però un tetto di 4.5MB sul corpo
// della richiesta a livello di PIATTAFORMA (non aggirabile da codice, vedi
// https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE): a 32kbps
// questo equivale a ~18-19 minuti di audio. Qualunque riunione più lunga
// veniva rifiutata da Vercel stesso PRIMA ancora di arrivare al nostro
// codice (route.ts), con un 413 il cui corpo non è il nostro JSON
// strutturato ma una pagina d'errore della piattaforma — che il vecchio
// codice sotto (`!res.ok` → `res.json()` fallisce → fallback a
// "upload_failed") scambiava per un errore transitorio, ritentandolo
// all'infinito ogni 30s (caso segnalato dall'utente: registrazione
// riunione mai caricata nonostante rete perfettamente funzionante — vista
// riprodursi live il 2026-09-17 con "198 tentativi" nella coda offline).
//
// Ora l'upload è in DUE fasi, per non passare mai più il file dentro una
// richiesta verso una nostra funzione serverless:
//   1. Il blob va DIRETTAMENTE dal browser a Supabase Storage (bucket
//      "audio"), usando la sessione utente già autenticata — le policy RLS
//      (supabase/migrations/008_storage.sql) permettono già a ogni utente
//      autenticato di scrivere nella propria cartella, quindi non serve
//      alcuna modifica lato server per abilitarlo. Questo bypassa del tutto
//      il limite di Vercel, qualunque sia la lunghezza della registrazione.
//   2. Solo il percorso risultante + la durata (poche decine di byte JSON)
//      vengono inviati a /api/upload/{kind}, che scarica il file da Storage
//      server-side (nessun limite sul corpo qui: è un fetch in uscita, non
//      una richiesta in entrata) e fa il resto (trascrizione, riassunto,
//      creazione della memoria) come prima.
//
// Se la fase 1 riesce ma la fase 2 fallisce (es. rete caduta subito dopo),
// il chiamante (vedi `onUploaded` sotto) salva il percorso in coda offline
// così un retry riparte dalla fase 2 senza ricaricare da capo il blob —
// altrimenti ogni tentativo fallito lascerebbe un file orfano su Storage e
// sprecherebbe dati/batteria ricaricando magari decine di MB ogni 30s.

import { createClient } from "./supabase/client";
import type { PendingCaptureKind } from "./offlineQueue";

const ENDPOINTS: Record<PendingCaptureKind, string> = {
  audio: "/api/upload/audio",
  meeting: "/api/upload/meeting",
};

const STORAGE_BUCKET = "audio";

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
  /**
   * 2026-09-17: prima questo campo non esisteva — ogni fallimento (rete
   * assente, ma anche errori del tutto diversi: un Blob non più leggibile
   * dopo essere stato riletto da IndexedDB, un errore di parsing, ecc.)
   * veniva etichettato genericamente "network_error" con lo stesso messaggio
   * "connessione debole", perdendo per sempre la causa reale. Risultato:
   * un caricamento poteva restare bloccato in coda per ore con rete
   * perfettamente funzionante, senza modo di capire perché (caso segnalato
   * dall'utente: registrazione riunione mai caricata nonostante rete ok —
   * causa reale trovata poi grazie a questo stesso campo, vedi commento in
   * cima al file).
   * Qui conserviamo il messaggio tecnico originale (nome+messaggio
   * dell'eccezione reale, o status HTTP) accanto a quello mostrato
   * all'utente — salvato in coda (vedi captureQueueStore.ts) e mostrato
   * dopo alcuni tentativi falliti (vedi PendingUploadsIndicator.tsx), per
   * poter diagnosticare un caso come questo senza dover indovinare.
   */
  technicalDetail: string;

  constructor(code: string, permanent: boolean, userMessage: string, technicalDetail?: string) {
    super(code);
    this.name = "UploadError";
    this.permanent = permanent;
    this.userMessage = userMessage;
    this.technicalDetail = technicalDetail ?? code;
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
    case "not_authenticated":
      return "Sessione scaduta: effettua di nuovo l'accesso e riprova.";
    case "file_not_found":
      return "Caricamento non riuscito: il file non risulta ancora arrivato sul server. Riprova.";
    default:
      return "Caricamento fallito. Controlla la connessione e riprova.";
  }
}

export interface UploadCaptureOptions {
  /**
   * Percorso su Supabase Storage già caricato in un tentativo precedente
   * (retry dalla coda offline — vedi PendingCapture.remotePath). Se
   * presente, salta la fase 1 (upload diretto) e passa subito alla fase 2
   * (finalizzazione), evitando di ricaricare il blob da capo.
   */
  remotePath?: string | null;
  /**
   * Chiamato subito dopo che la fase 1 (upload diretto su Storage) va a
   * buon fine, PRIMA di tentare la fase 2 — permette al chiamante di
   * persistere il percorso in coda offline così un eventuale fallimento
   * della finalizzazione non causa un nuovo upload del blob al prossimo
   * tentativo.
   */
  onUploaded?: (remotePath: string) => void | Promise<void>;
}

/**
 * Prova a caricare una registrazione. Lancia sempre un UploadError in caso
 * di fallimento (mai un errore "grezzo"), così chi chiama può decidere in
 * modo uniforme se ritentare (permanent === false) o no.
 */
export async function uploadCapture(
  kind: PendingCaptureKind,
  blob: Blob,
  duration: number,
  options: UploadCaptureOptions = {}
): Promise<Record<string, unknown>> {
  let remotePath = options.remotePath ?? null;

  // Fase 1: upload diretto del blob su Supabase Storage, solo se non è già
  // stato completato in un tentativo precedente.
  if (!remotePath) {
    const supabase = createClient();

    let userId: string;
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        // Trattato come transitorio (non permanent): può capitare che la
        // sessione non sia ancora idratata subito dopo l'avvio dell'app —
        // meglio ritentare che scartare la registrazione.
        throw new UploadError(
          "not_authenticated",
          false,
          describeErrorCode("not_authenticated", {}),
          authError ? `${authError.name}: ${authError.message}` : "Nessun utente autenticato"
        );
      }
      userId = user.id;
    } catch (err) {
      if (err instanceof UploadError) throw err;
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw new UploadError(
        "network_error",
        false,
        "Connessione assente o instabile: la registrazione resta salvata e verrà caricata appena possibile.",
        detail
      );
    }

    const path = `${userId}/${crypto.randomUUID()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { contentType: "audio/webm" });

    if (uploadError) {
      // L'SDK Supabase non espone uno status HTTP strutturato per ogni
      // causa possibile: trattiamo come transitorio di default (più sicuro
      // ritentare un caso che si sarebbe risolto da solo, piuttosto che
      // scartare per sempre una registrazione per un problema temporaneo).
      throw new UploadError(
        "storage_upload_failed",
        false,
        "Connessione assente o instabile: la registrazione resta salvata e verrà caricata appena possibile.",
        `StorageUploadError: ${uploadError.message}`
      );
    }

    remotePath = path;
    await options.onUploaded?.(path);
  }

  // Fase 2: finalizzazione — solo percorso + durata, mai il file: questa
  // richiesta resta sempre pochi byte di JSON, quindi non può mai urtare il
  // limite di 4.5MB delle funzioni Vercel, indipendentemente da quanto è
  // lunga la registrazione.
  let res: Response;
  try {
    res = await fetch(ENDPOINTS[kind], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: remotePath, duration }),
    });
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new UploadError(
      "network_error",
      false,
      "Connessione assente o instabile: la registrazione resta salvata e verrà caricata appena possibile.",
      detail
    );
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const code = typeof data?.error === "string" ? data.error : "upload_failed";
    const permanent = PERMANENT_ERROR_CODES.has(code);
    throw new UploadError(code, permanent, describeErrorCode(code, data), `HTTP ${res.status}: ${code}`);
  }

  return res.json().catch(() => ({}));
}
