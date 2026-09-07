"use client";

import { BottomNav } from "@/components/layout/BottomNav";
import { CaptureFab } from "@/components/capture/CaptureFab";
import { PendingUploadsIndicator } from "@/components/capture/PendingUploadsIndicator";
import { useLocationCheckin } from "@/hooks/useLocationCheckin";
import { useNativeSessionBridge } from "@/hooks/useNativeSessionBridge";
import { useNativeTrackingWatchdog } from "@/hooks/useNativeTrackingWatchdog";
import { useLocationFallbackTracking } from "@/hooks/useLocationFallbackTracking";
import { useCaptureQueueSync } from "@/hooks/useCaptureQueueSync";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Se l'utente non ha ancora completato /onboarding, lo reindirizza lì
  // prima di mostrare qualunque altra schermata — vedi il hook.
  useOnboardingGate();
  useLocationCheckin();
  // Tiene il lato nativo Android (tracking/geofencing in background)
  // aggiornato con la sessione Supabase corrente — vedi il hook per i dettagli.
  useNativeSessionBridge();
  // Riavvia il Foreground Service di tracciamento se Android lo ha ucciso
  // in background — prima girava solo dentro Impostazioni → Spostamenti,
  // quindi restava morto finché l'utente non apriva per caso quella pagina
  // (fix 2026-09-06, vedi il hook per le prove).
  useNativeTrackingWatchdog();
  // Fallback web/iOS (intervallo + re-ping su visibilitychange) per quando
  // il Foreground Service Android non è disponibile — prima girava solo
  // dentro Impostazioni → Spostamenti, stesso identico bug del watchdog qui
  // sopra: mai partito nell'uso reale perché nessuno tiene aperta quella
  // pagina mentre guida (fix 2026-09-07, vedi il hook per le prove).
  useLocationFallbackTracking();
  // Riprende/ritenta le registrazioni rimaste in coda offline (rete assente
  // al momento dell'upload) — vedi src/lib/offlineQueue.ts.
  useCaptureQueueSync();

  return (
    <div className="min-h-screen flex flex-col">
      <PendingUploadsIndicator />
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {/* Il pulsante di cattura ora è un + fluttuante, sempre visibile su
          ogni schermata, invece della vecchia barra full-width sempre
          agganciata in fondo: meno ingombro, stessa frizione minima. */}
      <CaptureFab />

      <BottomNav />
    </div>
  );
}
