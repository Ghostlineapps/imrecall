"use client";

import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { mutate } from "swr";

export function AudioRecorder({ onSaved }: { onSaved: () => void }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Bitrate basso ma ok per il parlato: tiene il file sotto il limite di
    // 25MB di Whisper anche per registrazioni lunghe (vedi audio/route.ts).
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      await uploadAudio(blob);
    };
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
