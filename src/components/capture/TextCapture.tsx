"use client";

import { useState } from "react";
import { MapPin, X, Loader2 } from "lucide-react";
import { useCapture } from "@/hooks/useCapture";
import { getCurrentDeviceCoords } from "@/lib/utils/nativeGeolocation";

type Coords = { latitude: number; longitude: number };

export function TextCapture({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const { captureText, isSaving } = useCapture();

  // Richiesta utente 2026-11-21: scrivendo una nota "a mano" non c'era modo
  // di dire dove ci si trova — solo le foto collegavano un luogo (via
  // EXIF/GPS, vedi ImageCapture.tsx). Qui non pre-risolviamo il nome del
  // luogo lato client (richiederebbe un'altra chiamata di rete prima ancora
  // di salvare): la geocodifica avviene lato server, come per le foto — vedi
  // geocodeAndLinkPlaceByCoords in /api/memories route.ts.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  async function handleAddLocation() {
    setLocating(true);
    setLocationError(null);
    const result = await getCurrentDeviceCoords();
    setLocating(false);
    if (result) {
      setCoords(result);
    } else {
      setLocationError("Posizione non disponibile. Controlla di aver concesso il permesso.");
    }
  }

  async function handleSave() {
    if (!text.trim()) return;
    await captureText(text.trim(), coords);
    setText("");
    setCoords(null);
    onSaved();
  }

  return (
    <div className="py-4 space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
        }}
        placeholder="Scrivi qualcosa da ricordare…"
        rows={4}
        autoFocus
        className="input-field resize-none"
      />

      {coords ? (
        <div className="flex items-center justify-between gap-2 text-sm text-primary-light bg-primary/10 rounded-xl px-3 py-2">
          <span className="flex items-center gap-1.5 truncate">
            <MapPin size={16} className="shrink-0" /> Posizione attuale aggiunta
          </span>
          <button
            onClick={() => setCoords(null)}
            className="text-white/40 hover:text-white p-0.5 shrink-0"
            aria-label="Rimuovi posizione"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={handleAddLocation}
          disabled={locating}
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          {locating ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
          {locating ? "Rilevamento posizione…" : "Aggiungi luogo"}
        </button>
      )}
      {locationError && <p className="text-urgent text-xs">{locationError}</p>}

      <button onClick={handleSave} disabled={!text.trim() || isSaving} className="btn-primary w-full">
        {isSaving ? "Salvataggio…" : "Salva"}
      </button>
    </div>
  );
}
