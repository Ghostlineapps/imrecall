"use client";

// src/app/onboarding/page.tsx
//
// Primo "momento wow" per i nuovi utenti: prima di mostrare un'app vuota
// (che non spiega da sola perché usarla), chiediamo di importare qualche
// ricordo — foto dalla galleria o l'export di Google Maps — e rispondiamo
// subito con qualcosa di concreto e personale trovato nei loro dati
// ("il 12 marzo 2019 eri a Roma"), esattamente la promessa della pagina di
// marketing ("Sei stato a Siviglia dieci anni fa... te lo ricordiamo noi").
//
// Pagina standalone (fuori da (app): niente BottomNav/CaptureFab, il gate
// in (app)/layout.tsx — vedi useOnboardingGate — porta qui i nuovi utenti
// finché non completano o saltano questo flusso una volta sola (vedi
// profiles.onboarding_completed, migration 029 per il backfill di chi era
// già utente prima di questa modifica).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { extractPointsFromPhotos, parseTakeoutFile, sendPointsInChunks } from "@/lib/import/locationImport";

type Step = "intro" | "importing" | "reveal" | "no-highlights";

type Highlight = {
  recorded_at: string;
  place_name: string | null;
  latitude: number;
  longitude: number;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function yearsAgo(iso: string): string {
  const years = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return months === 1 ? "un mese fa" : `${months} mesi fa`;
  }
  const rounded = Math.round(years);
  return rounded === 1 ? "un anno fa" : `${rounded} anni fa`;
}

async function finishOnboarding() {
  await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ onboarding_completed: true }),
  }).catch(() => {});
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [finishing, setFinishing] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const takeoutInputRef = useRef<HTMLInputElement>(null);

  async function afterImport(inserted: number) {
    setImportedCount(inserted);
    setProgressMessage("Cerco qualcosa di interessante nei tuoi ricordi…");
    try {
      const res = await fetch("/api/locations/highlights");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.highlights) && data.highlights.length > 0) {
        setHighlights(data.highlights);
        setStep("reveal");
        return;
      }
    } catch {
      // Se la ricerca dei momenti salienti fallisce, non blocchiamo
      // l'onboarding per questo: passiamo comunque a un messaggio positivo.
    }
    setStep("no-highlights");
  }

  async function handlePhotoImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setError(null);
    setStep("importing");
    setProgressMessage("Analizzo le foto…");

    let points, unreadable;
    try {
      ({ points, unreadable } = await extractPointsFromPhotos(files));
    } catch (err: any) {
      // Errore nel modulo di analisi EXIF: messaggio già pensato per
      // l'utente, sicuro da mostrare così com'è.
      setError(err?.message || "Analisi delle foto fallita. Controlla la connessione e riprova.");
      setStep("intro");
      return;
    }

    if (points.length === 0) {
      setError(
        unreadable === files.length
          ? "Non sono riuscito ad analizzare queste foto. Prova con foto scattate direttamente dalla fotocamera."
          : "Nessuna delle foto selezionate contiene dati di posizione (GPS)."
      );
      setStep("intro");
      return;
    }

    try {
      const inserted = await sendPointsInChunks(points, "photo", () => {});
      await afterImport(inserted);
    } catch {
      // Errore lato server (rete, sessione...): mai mostrato grezzo.
      setError("Caricamento fallito. Controlla la connessione e riprova.");
      setStep("intro");
    }
  }

  async function handleTakeoutImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setStep("importing");
    setProgressMessage("Leggo il file…");

    let points;
    try {
      points = await parseTakeoutFile(file);
    } catch (err: any) {
      // Errori di parsing/validazione: messaggi già pensati per l'utente,
      // sicuri da mostrare così come sono.
      setError(err?.message || "Importazione fallita. Controlla la connessione e riprova.");
      setStep("intro");
      return;
    }

    try {
      const inserted = await sendPointsInChunks(points, "import", (done, total) =>
        setProgressMessage(`Importazione in corso… ${done}/${total}`)
      );
      await afterImport(inserted);
    } catch (err: any) {
      // Qui l'errore può arrivare dal server (rete, sessione scaduta...):
      // non lo mostriamo mai grezzo, solo il caso "parziale" è specifico.
      const msg = String(err?.message ?? "");
      setError(
        msg.startsWith("partial:")
          ? `Importazione interrotta dopo ${msg.split(":")[1]} spostamenti. Riprova.`
          : "Importazione fallita. Controlla la connessione e riprova."
      );
      setStep("intro");
    }
  }

  async function handleFinish() {
    setFinishing(true);
    await finishOnboarding();
    router.replace("/home");
  }

  async function handleSkip() {
    setFinishing(true);
    await finishOnboarding();
    router.replace("/home");
  }

  return (
    <div className="bg-celeste-bg min-h-screen px-5 py-8 text-celeste-navy flex flex-col">
      {step === "intro" && (
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8 animate-fade-in">
          <div className="space-y-3 text-center">
            <h1 className="text-2xl font-semibold">La tua memoria, in orbita.</h1>
            <p className="text-celeste-muted text-sm leading-relaxed">
              IMRECALL funziona meglio quando conosce già dove sei stato. Importa qualche ricordo
              e te lo dimostriamo subito.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="card-light w-full text-left space-y-1 hover:shadow-md transition-shadow"
            >
              <p className="font-medium">📷 Foto dalla galleria</p>
              <p className="text-sm text-celeste-muted">
                Il modo più veloce: bastano 5-10 foto scattate col telefono. Restano sul telefono,
                non vengono caricate.
              </p>
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoImport}
              className="hidden"
            />

            <button
              onClick={() => takeoutInputRef.current?.click()}
              className="card-light w-full text-left space-y-1 hover:shadow-md transition-shadow"
            >
              <p className="font-medium">🗺️ Cronologia Google Maps</p>
              <p className="text-sm text-celeste-muted">
                Se hai già scaricato l&apos;export da Google Takeout, caricalo qui.
              </p>
            </button>
            <input
              ref={takeoutInputRef}
              type="file"
              accept="application/json"
              onChange={handleTakeoutImport}
              className="hidden"
            />
          </div>

          {error && <p className="text-urgent text-sm text-center">{error}</p>}

          <button
            onClick={handleSkip}
            disabled={finishing}
            className="text-celeste-muted text-sm underline text-center mx-auto disabled:opacity-40"
          >
            Salta per ora, lo faccio più tardi
          </button>
        </div>
      )}

      {step === "importing" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full space-y-4 animate-fade-in text-center">
          <div className="w-10 h-10 rounded-full border-2 border-celeste-accent border-t-transparent animate-spin" />
          <p className="text-celeste-muted text-sm">{progressMessage}</p>
        </div>
      )}

      {step === "reveal" && (
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6">
          <div className="text-center space-y-1 animate-fade-in">
            <p className="text-celeste-accent text-sm font-medium">
              {importedCount} {importedCount === 1 ? "ricordo importato" : "ricordi importati"}
            </p>
            <h1 className="text-xl font-semibold">Guarda cosa abbiamo già ritrovato.</h1>
          </div>

          <div className="space-y-3">
            {highlights.map((h, i) => (
              <div
                key={i}
                className="card-light animate-fade-in"
                style={{ animationDelay: `${i * 0.15}s`, animationFillMode: "backwards" }}
              >
                <p className="text-sm text-celeste-muted">{yearsAgo(h.recorded_at)}</p>
                <p className="font-medium mt-0.5">
                  Il {formatWhen(h.recorded_at)} eri a{" "}
                  {h.place_name || `${h.latitude.toFixed(3)}, ${h.longitude.toFixed(3)}`}.
                </p>
              </div>
            ))}
          </div>

          <p className="text-celeste-muted text-xs text-center animate-fade-in">
            Da ora IMRECALL può rispondere a &ldquo;dove ero il...?&rdquo; e collegare i tuoi
            ricordi ai posti in cui torni.
          </p>

          <button onClick={handleFinish} disabled={finishing} className="btn-primary-light w-full">
            {finishing ? "Un attimo…" : "Perfetto, andiamo"}
          </button>
        </div>
      )}

      {step === "no-highlights" && (
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6 text-center animate-fade-in">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">
              {importedCount > 0 ? `Importati ${importedCount} spostamenti.` : "Va bene così."}
            </h1>
            <p className="text-celeste-muted text-sm">
              Aggiungeremo i tuoi ricordi man mano che li vivi. Puoi importare foto o Google Maps
              quando vuoi da Impostazioni → Spostamenti.
            </p>
          </div>
          <button onClick={handleFinish} disabled={finishing} className="btn-primary-light w-full">
            {finishing ? "Un attimo…" : "Inizia a usare IMRECALL"}
          </button>
        </div>
      )}
    </div>
  );
}
