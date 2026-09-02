"use client";

import { useRef, useState } from "react";
import { Users, Square, CheckCircle2 } from "lucide-react";
import { mutate } from "swr";
import { useCaptureQueueStore } from "@/stores/captureQueueStore";
import { uploadCapture, UploadError } from "@/lib/uploadCapture";

// Stesso schema di AudioRecorder.tsx, ma pensato per registrazioni lunghe
// (riunioni/call), non note vocali brevi: timer in HH:MM:SS invece di
// MM:SS, chunk periodici invece di un unico blob finale (più robusto per
// registrazioni di decine di minuti), e un messaggio di attesa più esplicito
// durante l'elaborazione (trascrizione + riassunto di una call lunga può
// richiedere qualche decina di secondi, non pochi secondi come una nota
// vocale breve).
//
// 2026-09-02: vedi lo stesso commento in AudioRecorder.tsx — due fix mirati
// al PERMESSO del microfono non hanno cambiato nulla sul telefono di test
// nonostante il permesso RECORD_AUDIO risultasse concesso, quindi qui
// proviamo più mimeType con MediaRecorder.isTypeSupported invece di uno
// fisso, distinguiamo l'errore di permesso da quello di formato non
// supportato, e mostriamo il dettaglio tecnico nel messaggio per poter
// diagnosticare da uno screenshot, senza accesso ai log del telefono.
function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignora e prova il prossimo
    }
  }
  return undefined;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function MeetingRecorder({ onSaved }: { onSaved: () => void }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detectedMessage, setDetectedMessage] = useState<string | null>(null);
  // Mostrato quando la registrazione è salva in coda offline (upload
  // fallito per rete, ma non persa) invece che quando è un errore vero.
  const [notice, setNotice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mantiene lo schermo acceso durante la registrazione: le riunioni durano
  // decine di minuti, ben oltre il blocco automatico dello schermo (1-5
  // minuti a seconda del telefono) — senza questo, lo schermo si spegne e
  // la registrazione si interrompe silenziosamente, senza errore visibile
  // e senza nulla da salvare quando si riapre l'app.
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  async function startRecording() {
    setError(null);
    setDetectedMessage(null);
    try {
      // Richiesta esplicita del permesso nativo, inline (non delegata a un
      // helper importato da un altro modulo — vedi nativeGeolocation.ts,
      // commento 2026-09-01, per il perché) con timeout di guardia di 3s.
      try {
        const core = await import("@capacitor/core");
        if (core.Capacitor.isNativePlatform()) {
          const bridge = core.registerPlugin<{
            requestMicrophonePermission(): Promise<{ granted: boolean }>;
          }>("NativeBridge");
          if (bridge) {
            await Promise.race([
              bridge.requestMicrophonePermission(),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);
          }
        }
      } catch {
        // Non bloccante: su web/PWA il modulo nativo non esiste.
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        throw new Error(
          `Impossibile accedere al microfono (permesso negato o non disponibile). [${describeError(err)}]`
        );
      }

      const mimeType = pickSupportedMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(`Il telefono non supporta la registrazione audio in questo formato. [${describeError(err)}]`);
      }
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      // Chunk ogni 5s invece di un unico blob a fine registrazione: per una
      // call di 60-90 minuti evita di tenere tutto in un solo evento a fine
      // corsa e rende la registrazione più resiliente.
      recorder.start(5000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Non bloccante: se il wake lock non è supportato o viene negato,
        // la registrazione parte comunque.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile accedere al microfono. Controlla di aver concesso il permesso microfono a IMRECALL nelle impostazioni del telefono/browser."
      );
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);

    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    // Assegniamo onstop PRIMA di chiamare stop() e fermiamo le tracce audio
    // solo dentro onstop (non subito dopo stop(), come prima): su alcuni
    // browser — in particolare Safari/iOS, dove questa registrazione si è
    // vista interrompersi senza salvare nulla — fermare lo stream troppo
    // presto può troncare l'ultimo chunk prima ancora che l'evento "stop"
    // scatti, risultando in un file vuoto o mancante.
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size === 0) {
        setError(
          "La registrazione è risultata vuota: probabilmente il telefono è passato in background o lo schermo si è bloccato durante la riunione. Riprova tenendo IMRECALL aperto in primo piano per tutta la durata."
        );
        return;
      }
      await saveAndUploadMeeting(blob);
    };
    recorder.stop();
  }

  // 2026-09-02: stessa logica di AudioRecorder.tsx — la registrazione viene
  // salvata PRIMA in coda offline (IndexedDB), poi si prova l'upload. Per
  // una riunione, che spesso è il contenuto più importante da non perdere,
  // questo è ancora più critico che per una nota vocale breve. Vedi
  // src/lib/offlineQueue.ts e src/stores/captureQueueStore.ts.
  async function saveAndUploadMeeting(blob: Blob) {
    setUploading(true);
    setError(null);
    setNotice(null);

    const queueId = await useCaptureQueueStore.getState().enqueue("meeting", blob, seconds);

    try {
      const data = await uploadCapture("meeting", blob, seconds);
      if (queueId) await useCaptureQueueStore.getState().markUploaded(queueId);
      mutate("/api/memories");

      const detected = data?.detected as { type?: string; title?: string } | undefined;
      if (detected?.type === "appointment") {
        mutate("/api/appointments");
        setDetectedMessage(`Appuntamento creato: ${detected.title}`);
      } else if (detected?.type === "deadline") {
        mutate("/api/deadlines");
        setDetectedMessage(`Scadenza creata: ${detected.title}`);
      }

      if (detected) {
        setTimeout(onSaved, 1800);
      } else {
        onSaved();
      }
    } catch (err) {
      if (err instanceof UploadError && err.permanent) {
        if (queueId) await useCaptureQueueStore.getState().markUploaded(queueId);
        setError(err.userMessage);
      } else {
        // Errore transitorio (rete): la registrazione della riunione resta
        // al sicuro in coda — è esattamente il caso che più preoccupa
        // (perdere una call di lavoro importante), quindi il messaggio è
        // esplicito che NON è andata persa.
        setNotice(
          queueId
            ? "Connessione debole: la registrazione della riunione è salvata e verrà caricata automaticamente appena possibile."
            : err instanceof UploadError
            ? err.userMessage
            : "Caricamento fallito. Controlla la connessione e riprova."
        );
        setTimeout(onSaved, 2000);
      }
    } finally {
      setUploading(false);
    }
  }

  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const elapsed = seconds >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;

  return (
    <div className="flex flex-col items-center py-8 gap-4">
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={uploading}
        className={
          recording
            ? "w-20 h-20 rounded-full bg-urgent flex items-center justify-center animate-pulse-record"
            : "w-20 h-20 rounded-full bg-primary flex items-center justify-center"
        }
      >
        {recording ? <Square size={26} fill="white" /> : <Users size={28} />}
      </button>
      <p className="text-white/50 text-sm tabular-nums">
        {uploading
          ? "Trascrizione in corso… per riunioni lunghe può richiedere un minuto"
          : recording
          ? elapsed
          : "Tocca per registrare la riunione"}
      </p>
      {!recording && !uploading && (
        <p className="text-white/30 text-xs text-center px-4">
          Appoggia il telefono vicino all'altoparlante durante la call
        </p>
      )}
      {detectedMessage && (
        <p className="text-primary-light text-sm flex items-center gap-1.5">
          <CheckCircle2 size={16} /> {detectedMessage}
        </p>
      )}
      {notice && <p className="text-white/50 text-sm text-center px-4">{notice}</p>}
      {error && <p className="text-urgent text-sm text-center px-4">{error}</p>}
    </div>
  );
}
