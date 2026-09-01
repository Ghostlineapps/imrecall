"use client";

import { BottomNav } from "@/components/layout/BottomNav";
import { CaptureFab } from "@/components/capture/CaptureFab";
import { useLocationCheckin } from "@/hooks/useLocationCheckin";
import { useNativeSessionBridge } from "@/hooks/useNativeSessionBridge";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useLocationCheckin();
  // Tiene il lato nativo Android (tracking/geofencing in background)
  // aggiornato con la sessione Supabase corrente — vedi il hook per i dettagli.
  useNativeSessionBridge();

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {/* Il pulsante di cattura ora è un + fluttuante, sempre visibile su
          ogni schermata, invece della vecchia barra full-width sempre
          agganciata in fondo: meno ingombro, stessa frizione minima. */}
      <CaptureFab />

      <BottomNav />
    </div>
  );
}
