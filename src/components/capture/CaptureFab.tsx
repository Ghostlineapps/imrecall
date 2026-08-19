"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CaptureSheet } from "./CaptureSheet";

/**
 * Pulsante di cattura sempre visibile, su ogni schermata — non solo in
 * Dashboard. Sostituisce la vecchia barra di cattura full-width, sempre
 * agganciata in fondo: qui basta un tocco per aprire lo stesso foglio con
 * tutte le modalità (testo, voce, riunione, foto, file, link), senza
 * occupare spazio permanente sullo schermo.
 */
export function CaptureFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Aggiungi un ricordo"
        className="fixed z-20 rounded-full w-14 h-14 flex items-center justify-center bg-gradient-to-br from-celeste-accent to-celeste-accentDark text-white shadow-xl shadow-black/40 border-2 border-white/20"
        style={{ right: 20, bottom: 84 }}
      >
        <Plus size={26} />
      </button>

      <CaptureSheet open={open} onClose={() => setOpen(false)} initialTab="text" />
    </>
  );
}
