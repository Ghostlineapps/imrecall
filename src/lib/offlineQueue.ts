// src/lib/offlineQueue.ts
//
// Coda offline per le registrazioni audio (note vocali, riunioni).
//
// 2026-09-02: prima di questa modifica, se l'upload di una registrazione
// falliva (rete assente/instabile, timeout), il blob audio esisteva SOLO in
// memoria dentro AudioRecorder/MeetingRecorder — un errore mostrava un
// messaggio, ma appena il componente veniva smontato (o l'utente chiudeva
// l'app) la registrazione era persa per sempre, senza modo di recuperarla.
// Per una nota vocale è già un problema; per la registrazione di una
// riunione di lavoro di un'ora è inaccettabile.
//
// Ora ogni registrazione viene PRIMA salvata qui (IndexedDB, non
// localStorage: i blob audio possono superare facilmente i 5-10MB di
// limite di localStorage, e localStorage non supporta Blob nativamente),
// poi si tenta l'upload. La riga viene rimossa dalla coda solo quando
// l'upload è confermato riuscito dal server. Se l'app viene chiusa o il
// telefono va offline a metà, la registrazione resta sul disco e viene
// ritentata al prossimo avvio o al ritorno della connessione (vedi
// src/stores/captureQueueStore.ts).

export type PendingCaptureKind = "audio" | "meeting";

export interface PendingCapture {
  id: string;
  kind: PendingCaptureKind;
  blob: Blob;
  duration: number;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

const DB_NAME = "imrecall-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending-captures";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile in questo contesto"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Apertura IndexedDB fallita"));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Operazione IndexedDB fallita"));
  });
}

/** Salva subito una nuova registrazione in coda, PRIMA di provare l'upload. */
export async function enqueueCapture(
  kind: PendingCaptureKind,
  blob: Blob,
  duration: number
): Promise<PendingCapture> {
  const item: PendingCapture = {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    blob,
    duration,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(item);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Salvataggio in coda fallito"));
  });
  db.close();
  return item;
}

/** Tutte le registrazioni ancora in attesa di essere caricate (in ordine di creazione). */
export async function listPendingCaptures(): Promise<PendingCapture[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const items = await runRequest<PendingCapture[]>(
    tx.objectStore(STORE_NAME).getAll() as IDBRequest<PendingCapture[]>
  );
  db.close();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

/** Rimuove una registrazione dalla coda: va chiamata SOLO a upload confermato riuscito
 * (o quando il server ha rifiutato in modo definitivo, es. limite superato — vedi
 * uploadCapture.ts, UploadError.permanent). */
export async function removePendingCapture(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Rimozione dalla coda fallita"));
  });
  db.close();
}

/** Aggiorna il conteggio tentativi e l'ultimo errore, senza rimuovere la registrazione:
 * usato per i fallimenti transitori (rete), su cui vale la pena ritentare più tardi. */
export async function markCaptureAttemptFailed(id: string, error: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const item = await runRequest<PendingCapture | undefined>(store.get(id));
  if (item) {
    item.attempts += 1;
    item.lastError = error;
    store.put(item);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Aggiornamento coda fallito"));
  });
  db.close();
}
