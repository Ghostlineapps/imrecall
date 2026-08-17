"use client";

import { BottomNav } from "@/components/layout/BottomNav";
import { CaptureBar } from "@/components/capture/CaptureBar";
import { useLocationCheckin } from "@/hooks/useLocationCheckin";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useLocationCheckin();

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 overflow-y-auto pb-40">{children}</main>

      {/* La barra di cattura resta sempre visibile e accessibile: è il cuore
          dell'abitudine — meno frizione qui, più memorie catturate. */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-bg via-bg to-transparent pt-6">
        <CaptureBar />
      </div>

      <BottomNav />
    </div>
  );
}
