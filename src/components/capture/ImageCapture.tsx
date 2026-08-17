"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { mutate } from "swr";

export function ImageCapture({ onSaved }: { onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    setPreview(URL.createObjectURL(file));
    setUploading(true);

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

      mutate("/api/memories");
      onSaved();
    } catch {
      // gestione errore: toast + retry
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
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {uploading && <p className="text-white/50 text-sm">Analisi in corso…</p>}
    </div>
  );
}
