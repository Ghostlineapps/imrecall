"use client";

import { useRef, useState } from "react";
import { FileUp, CheckCircle2 } from "lucide-react";
import { mutate } from "swr";

// Per ora accettiamo solo formati che sappiamo leggere davvero (vedi
// extractText.ts): PDF, TXT, CSV, MD. Word/Excel/PowerPoint arriveranno in
// un secondo momento — vedi BACKLOG.md.
const ACCEPTED = ".pdf,.txt,.csv,.md,application/pdf,text/plain,text/csv,text/markdown";

export function DocumentCapture({ onSaved }: { onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedMessage, setDetectedMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setUploading(true);
    setError(null);
    setDetectedMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const res = await fetch("/api/upload/document", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
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
    } catch {
      setError("Caricamento fallito. Controlla la connessione e riprova.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center py-6 gap-4">
      {fileName ? (
        <div className="w-40 h-40 rounded-2xl bg-white/5 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <FileUp size={28} className="text-white/50" />
          <span className="text-xs text-white/70 line-clamp-2">{fileName}</span>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-40 h-40 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/70 hover:border-white/30 transition-colors"
        >
          <FileUp size={28} />
          <span className="text-xs">Carica un file</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <p className="text-white/30 text-xs text-center px-4">PDF, TXT, CSV, MD — Word/Excel/PowerPoint in arrivo</p>
      {uploading && <p className="text-white/50 text-sm">Analisi in corso…</p>}
      {detectedMessage && (
        <p className="text-primary-light text-sm flex items-center gap-1.5">
          <CheckCircle2 size={16} /> {detectedMessage}
        </p>
      )}
      {error && <p className="text-urgent text-sm">{error}</p>}
    </div>
  );
}
