"use client";

import { useRef, useState } from "react";
import { Users, Square, CheckCircle2 } from "lucide-react";
import { mutate } from "swr";

// Stesso schema di AudioRecorder.tsx, ma pensato per registrazioni lunghe
// (riunioni/call), non note vocali brevi: timer in HH:MM:SS invece di
// MM:SS, chunk periodici invece di un unico blob finale (più robusto per
// registrazioni di decine di minuti), e un messaggio di attesa più esplicito
// durante l'elaborazione (trascrizione + riassunto di una call lunga può
// richiedere qualche decina di secondi, non pochi secondi come una nota
// vocale breve).
export function MeetingRecorder({ onSaved }: { onSaved: () => void }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detectedMessage, setDetectedMessage] = useState<string | null>(null);
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
      // 2026-09-02: la prima versione di questo fix chiamava
      // ensureNativeMicrophonePermission() importata da
      // nativeGeolocation.ts. Non ha risolto il bug: nello stesso file, un
      // commento del 2026-09-01 documenta 8 round di debug del bridge di
      // posizione in cui è emerso che su questo dispositivo una funzione
      // che "aspetta" il risultato di un'ALTRA funzione asincrona che a
      // sua volta usa il plugin nativo NativeBridge a volte non si risolve
      // MAI — l'utente resta bloccato senza errore visibile ("niente
      // succede"), non con l'errore mostrato più sotto. La soluzione
      // adottata allora fu smettere di delegare a helper condivisi e
      // inlineare la logica dentro ogni funzione chiamante: la applichiamo
      // anche qui, invece di richiamare l'helper. In più, per sicurezza,
      // mettiamo un timeout di guardia: se il plugin nativo non risponde
      // entro 3s proseguiamo comunque con getUserMedia, che ha un proprio
      // meccanismo di permesso/errore e non deve restare bloccato in
      // attesa di un plugin che non risponde.
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
        // Non bloccante: su web/PWA il modulo nativo non esiste, e se la
        // richiesta nativa fallisce lasciamo che sia getUserMedia a
        // gestire l'esito.
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Bitrate basso ma esplicito (senza specificarlo, il default del
      // browser per l'audio può arrivare a ~128kbps, che per una riunione di
      // 60-90 minuti supererebbe facilmente il limite di 25MB di Whisper). A
      // 32kbps mono l'opus resta ampiamente intelligibile per il parlato e
      // un'ora di registrazione pesa ~14MB, ben sotto la soglia (vedi
      // MAX_FILE_BYTES in /api/upload/meeting).
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 32000,
      });
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
    } catch {
      setError(
        "Impossibile accedere al microfono. Controlla di aver concesso il permesso microfono a IMRECALL nelle impostazioni del telefono/browser."
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
      await uploadMeeting(blob);
    };
    recorder.stop();
  }

  async function uploadMeeting(blob: Blob) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "meeting.webm");
      formData.append("duration", String(seconds));

      const res = await fetch("/api/upload/meeting", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "duration_exceeded") {
          const maxMin = Math.round((data.max ?? 0) / 60);
          throw new Error(`Registrazione troppo lunga per il tuo piano (massimo ${maxMin} minuti).`);
        }
        if (data?.error === "monthly_minutes_exceeded") {
          throw new Error(
            `Hai esaurito i minuti di trascrizione di questo mese (${data.max_minutes} min). Riprova il mese prossimo o passa a un piano superiore.`
          );
        }
        if (data?.error === "limit_reached") {
          throw new Error(`Hai raggiunto il limite di ${data.limit} memorie questo mese.`);
        }
        if (data?.error === "file_too_large") {
          throw new Error(`File troppo grande (massimo ${data.max_mb} MB).`);
        }
        throw new Error("upload_failed");
      }

      const data = await res.json();
      mutate("/api/memories");

      if (data?.detected?.type === "appointment") {
        mutate("/api/appointments");
        setDetectedMessage(`Appuntamento creato: ${data.detected.title}`);
      } else if (data?.detected?.type === "deadline") {
        mutate("/api/deadlines");
        setDetectedMessage(`Scadenza creata: ${data.detected.title}`);
      }

      if (data?.detected) {
        setTimeout(onSaved, 1800);
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caricamento fallito. Controlla la connessione e riprova.");
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
      {error && <p className="text-urgent text-sm text-center px-4">{error}</p>}
    </div>
  );
}
