"use client";

import { useRef, useState } from "react";
import { FileUp, CheckCircle2 } from "lucide-react";
import { mutate } from "swr";

// Formati che sappiamo leggere davvero (vedi extractText.ts): PDF, TXT,
// CSV, MD, Word (.docx), Excel (.xlsx/.xls), PowerPoint (.pptx).
const ACCEPTED =
  ".pdf,.txt,.csv,.md,.docx,.xlsx,.xls,.pptx,application/pdf,text/plain,text/csv,text/markdown," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function DocumentCapture({
  onSaved,
  isHealth = false,
  isPregnancy = false,
}: {
  onSaved: () => void;
  // true quando il file viene caricato dalla sezione Salute — marca la
  // memoria come is_health così compare nella lista referti/esami (vedi
  // migrazione 020), senza alcun effetto su categorie o ricerca generica.
  isHealth?: boolean;
  // true quando il file viene caricato dalla sezione Gravidanza — marca la
  // memoria come is_pregnancy (vedi migrazione 028).
  isPregnancy?: boolean;
}) {
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
      if (isHealth) formData.append("is_health", "true");
      if (isPregnancy) formData.append("is_pregnancy", "true");

      const res = await fetch("/api/upload/document", { method: "POST", body: formData });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.error === "limit_reached") {
          throw new Error(`Hai raggiunto il limite di ${errData.limit} memorie questo mese.`);
        }
        if (errData?.error === "document_limit_reached") {
          throw new Error(`Hai raggiunto il limite di ${errData.limit} documenti questo mese.`);
        }
        if (errData?.error === "file_too_large") {
          throw new Error(`File troppo grande (massimo ${errData.max_mb} MB).`);
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
      setError(err instanceof Error && err.message !== "upload_failed" ? err.message : "Caricamento fallito. Controlla la connessione e riprova.");
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
      <p className="text-white/30 text-xs text-center px-4">PDF, Word, Excel, PowerPoint, TXT, CSV, MD</p>
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
