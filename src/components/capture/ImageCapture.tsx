"use client";

import { useRef, useState } from "react";
import { ImagePlus, CheckCircle2 } from "lucide-react";
import { mutate } from "swr";

export function ImageCapture({ onSaved }: { onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedMessage, setDetectedMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    setError(null);

    try {
      // Compressione client-side prima dell'upload (max 1024px, ~0.85 quality)
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1024,
        initialQuality: 0.85,
        maxSizeMB: 2,
      });

      const formData = new FormData();
      formData.append("file", compressed, file.name);

      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
      const data = await res.json();

      // Aggiorniamo sia i ricordi che, se rilevato, appuntamenti/scadenze:
      // così chi ha già quella pagina aperta la vede aggiornata subito,
      // invece di doversi fidare che sia successo qualcosa in background.
      mutate("/api/memories");

      if (data?.detected?.type === "appointment") {
        mutate("/api/appointments");
        setDetectedMessage(`Appuntamento creato: ${data.detected.title}`);
      } else if (data?.detected?.type === "deadline") {
        mutate("/api/deadlines");
        setDetectedMessage(`Scadenza creata: ${data.detected.title}`);
      }

      // Se abbiamo rilevato qualcosa, mostriamo la conferma un attimo prima
      // di chiudere il pannello: altrimenti l'utente non ha modo di sapere
      // che è stato creato un appuntamento/scadenza dalla foto.
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
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="w-40 h-40 object-cover rounded-2xl" />
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-40 h-40 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/70 hover:border-white/30 transition-colors"
        >
          <ImagePlus size={28} />
          <span className="text-xs">Scatta o carica</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
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
