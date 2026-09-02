"use client";

import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { mutate } from "swr";

// 2026-09-02: due fix precedenti mirati al PERMESSO del microfono non hanno
// cambiato nulla nel comportamento osservato sul telefono di test, pur
// avendo il permesso RECORD_AUDIO confermato concesso da Impostazioni.
// Questo suggerisce che il permesso potrebbe non essere affatto la causa:
// il blocco try/catch di startRecording avvolgeva SIA getUserMedia SIA la
// creazione del MediaRecorder con un mimeType fisso
// ("audio/webm;codecs=opus"), quindi se quel formato non fosse supportato
// dalla WebView di sistema del telefono, l'eccezione verrebbe comunque
// mostrata come "Impossibile accedere al microfono" — un messaggio
// fuorviante che punta al permesso quando il problema reale è un altro.
// Per questo qui: (1) proviamo più mimeType in ordine con
// MediaRecorder.isTypeSupported prima di creare il recorder, invece di
// usarne uno fisso; (2) separiamo i punti di fallimento (permesso vs
// formato) in errori distinti; (3) aggiungiamo il dettaglio tecnico
// dell'errore nel messaggio mostrato, cosi se il problema persiste
// un semplice screenshot basta a capire la causa reale senza dover
// accedere ai log del telefono.
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

export function AudioRecorder({ onSaved }: { onSaved: () => void }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mantiene lo schermo acceso durante la registrazione: senza, il blocco
  // automatico dello schermo (dopo 1-5 minuti a seconda del telefono)
  // interrompe silenziosamente la registrazione — nessun errore visibile,
  // semplicemente non c'è più nulla da salvare quando si riapre l'app.
  // Wake Lock API: supportata su Chrome/Android e Safari 16.4+, non
  // bloccante se assente (la registrazione parte comunque).
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  async function startRecording() {
    setError(null);
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

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
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

    // Stesso ordine di MeetingRecorder.tsx: onstop assegnato PRIMA di
    // stop(), tracce fermate solo dentro onstop, per evitare che su
    // Safari/iOS l'ultimo pezzetto di audio venga troncato.
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size === 0) {
        setError("La registrazione è risultata vuota. Riprova tenendo IMRECALL aperto in primo piano.");
        return;
      }
      await uploadAudio(blob);
    };
    recorder.stop();
  }

  async function uploadAudio(blob: Blob) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      formData.append("duration", String(seconds));

      const res = await fetch("/api/upload/audio", { method: "POST", body: formData });

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

      mutate("/api/memories");
      onSaved();
    } catch (err) {
      // TODO: salvataggio in coda offline per i fallimenti di rete (vedi
      // Zustand captureStore per il retry) — qui mostriamo almeno l'errore
      // invece di fallire in silenzio.
      setError(err instanceof Error ? err.message : "Caricamento fallito. Controlla la connessione e riprova.");
    } finally {
      setUploading(false);
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

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
        {recording ? <Square size={26} fill="white" /> : <Mic size={28} />}
      </button>
      <p className="text-white/50 text-sm tabular-nums">
        {uploading ? "Salvataggio…" : recording ? `${mm}:${ss}` : "Tocca per registrare"}
      </p>
      {error && <p className="text-urgent text-sm text-center px-4">{error}</p>}
    </div>
  );
}
