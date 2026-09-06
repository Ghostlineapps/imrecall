"use client";

import { useRef, useState } from "react";
import { ImagePlus, CheckCircle2 } from "lucide-react";
import { mutate } from "swr";
import { ensureNativeLocationPermission } from "@/lib/utils/nativeGeolocation";

// Prova prima l'EXIF della foto (funziona anche per scatti vecchi importati
// dalla galleria); se manca (screenshot, immagini scaricate da chat...),
// ripiega sulla posizione attuale del dispositivo — un'approssimazione
// ragionevole solo per una foto appena scattata, ma meglio di non collegare
// nessun luogo.
async function extractPhotoCoords(file: File): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const mod: any = await import("exifr");
    const exifr = mod?.default ?? mod;
    const gps = await exifr?.gps?.(file);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      return { latitude: gps.latitude, longitude: gps.longitude };
    }
  } catch {
    // formato non supportato o nessun EXIF: proviamo il fallback sotto
  }

  if (!("geolocation" in navigator)) return null;

  // Dentro l'app nativa Android il vero permesso di sistema va chiesto
  // esplicitamente tramite il plugin Capacitor prima di usare
  // navigator.geolocation, altrimenti la webview rifiuta sempre in
  // silenzio — vedi nativeGeolocation.ts, useLocationCheckin.ts e
  // NearbyForYou.tsx. Mancava qui: era il motivo per cui il caricamento
  // foto non collegava quasi mai un luogo (fix 2026-09-06). Su web/PWA
  // questa chiamata non fa nulla.
  await ensureNativeLocationPermission();

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 5 * 60 * 1000 })
    );
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null; // permesso negato o non disponibile: la foto viene comunque caricata
  }
}

// La memoria va datata al momento dello SCATTO, non a quando viene caricata
// — altrimenti importare una foto vecchia (o anche solo di ieri) la
// registra come "oggi", e tutto il resurfacing "un anno fa eri qui" non può
// mai funzionare per nulla che non sia caricato nell'istante esatto in cui
// è stato scattato. Bug reale trovato il 2026-09-06: /api/upload/image
// impostava sempre memory_date a new Date() lato server, ignorando del
// tutto quando la foto era stata scattata davvero.
// DateTimeOriginal (EXIF) è la fonte più affidabile; se manca (screenshot,
// immagini senza EXIF) ripieghiamo su file.lastModified — non perfetto per
// una foto ricevuta via chat/scaricata, ma sempre meglio della data di
// caricamento per foto vecchie importate dalla galleria.
async function extractPhotoDate(file: File): Promise<Date | null> {
  try {
    const mod: any = await import("exifr");
    const exifr = mod?.default ?? mod;
    const tags = await exifr?.parse?.(file, { pick: ["DateTimeOriginal", "CreateDate"] });
    const raw = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  } catch {
    // formato non supportato o nessun EXIF: proviamo il fallback sotto
  }

  if (typeof file.lastModified === "number" && file.lastModified > 0) {
    return new Date(file.lastModified);
  }

  return null;
}

export function ImageCapture({
  onSaved,
  isHealth = false,
  isExpense = false,
  isPregnancy = false,
}: {
  onSaved: () => void;
  // true quando la foto viene caricata dalla sezione Salute — marca la
  // memoria come is_health così compare nella lista referti/esami (vedi
  // migrazione 020), senza alcun effetto su categorie o ricerca generica.
  isHealth?: boolean;
  // true quando la foto viene caricata dalla sezione Spese — marca la
  // memoria come is_expense (vedi migrazione 022). La lettura dello
  // scontrino (importo/negozio/categoria) funziona comunque da qualsiasi
  // foto, non solo da qui — vedi RECEIPT_DETECTED in /api/upload/image.
  isExpense?: boolean;
  // true quando la foto viene caricata dalla sezione Gravidanza — marca la
  // memoria come is_pregnancy (vedi migrazione 028), così compare nella
  // lista esami/referti di quello spazio.
  isPregnancy?: boolean;
}) {
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
      // Proviamo a leggere le coordinate GPS dall'EXIF del file ORIGINALE,
      // prima della compressione: browser-image-compression re-incapsula
      // l'immagine via canvas e perde tutti i metadati EXIF, quindi va
      // fatto qui o non funzionerà più dopo. Questo è ciò che permette il
      // "ti ricordi quando eri qui?" quando torni nello stesso posto — vedi
      // /api/upload/image e nearby_memories().
      const coords = await extractPhotoCoords(file);
      // Stessa cosa per la data reale dello scatto (vedi extractPhotoDate):
      // va letta anche questa dal file originale, prima della compressione.
      const capturedAt = await extractPhotoDate(file);

      // Compressione client-side prima dell'upload (max 1024px, ~0.85 quality)
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1024,
        initialQuality: 0.85,
        maxSizeMB: 2,
      });

      const formData = new FormData();
      formData.append("file", compressed, file.name);
      if (coords) {
        formData.append("latitude", String(coords.latitude));
        formData.append("longitude", String(coords.longitude));
      }
      if (capturedAt) {
        formData.append("captured_at", capturedAt.toISOString());
      }
      if (isHealth) formData.append("is_health", "true");
      if (isExpense) formData.append("is_expense", "true");
      if (isPregnancy) formData.append("is_pregnancy", "true");

      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
      const data = await res.json();

      // Aggiorniamo sia i ricordi che, se rilevato, appuntamenti/scadenze/
      // spese: così chi ha già quella pagina aperta la vede aggiornata
      // subito, invece di doversi fidare che sia successo qualcosa in
      // background.
      mutate("/api/memories");

      if (data?.detected?.type === "appointment") {
        mutate("/api/appointments");
        setDetectedMessage(`Appuntamento creato: ${data.detected.title}`);
      } else if (data?.detected?.type === "deadline") {
        mutate("/api/deadlines");
        setDetectedMessage(`Scadenza creata: ${data.detected.title}`);
      } else if (data?.detected?.type === "expense") {
        mutate("/api/expenses");
        setDetectedMessage(`Spesa registrata: ${data.detected.title} — puoi correggerla in Spese se serve`);
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
