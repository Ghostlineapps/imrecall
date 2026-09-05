"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus, HeartPulse, Droplet, ChevronRight } from "lucide-react";
import { MemoryCard } from "@/components/timeline/MemoryCard";
import { CaptureSheet } from "@/components/capture/CaptureSheet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Non è una nuova categorizzazione né una vista di ricerca alternativa —
// serve solo a rendere visibile che qui si possono caricare referti (esami
// del sangue, visite specialistiche...) come foto o file, oltre ai
// farmaci. La ricerca generica continua a funzionare su tutti i ricordi
// indipendentemente da questa sezione (vedi migrazione 020).
// 2026-08-26: palette celeste (ottava schermata convertita). MemoryCard usa
// la variante `light` già introdotta con Ricordi; CaptureSheet resta scuro
// per ora (componente condiviso, fuori scope).
export default function HealthPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data, isLoading } = useSWR("/api/memories?is_health=true&limit=100", fetcher);

  const memories = data?.memories ?? [];

  const grouped = memories.reduce((acc: Record<string, any[]>, m: any) => {
    const day = new Date(m.memory_date).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    acc[day] = acc[day] || [];
    acc[day].push(m);
    return acc;
  }, {});

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-5 text-celeste-navy">
      <h1 className="text-xl font-semibold">Salute</h1>
      <p className="text-celeste-muted text-sm">
        Farmaci, referti ed esami in un unico posto. Carica la foto o il file di un esame del
        sangue, di una visita specialistica o di qualsiasi altro documento medico.
      </p>

      <button
        onClick={() => setSheetOpen(true)}
        className="btn-primary-light w-full flex items-center justify-center gap-2"
      >
        <Plus size={18} />
        Aggiungi referto o farmaco
      </button>

      {/* Punto d'ingresso al ciclo (migrazione 031) — non una nuova
          categorizzazione dei ricordi come il resto di questa pagina, per
          questo è un link a una sezione a sé (/health/cycle) invece di un
          filtro qui dentro, sullo stesso principio di Gravidanza. */}
      <Link
        href="/health/cycle"
        className="card-light flex items-center gap-3 hover:bg-celeste-navy/[0.02] transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-celeste-accent/10 flex items-center justify-center shrink-0">
          <Droplet size={18} className="text-celeste-accentDark" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-celeste-navy">Ciclo</p>
          <p className="text-xs text-celeste-muted mt-0.5">Previsioni, sintomi e correlazioni con i tuoi ricordi.</p>
        </div>
        <ChevronRight size={18} className="text-celeste-muted shrink-0" />
      </Link>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="card-light h-16 animate-pulse bg-celeste-navy/5" />
          ))}
        </div>
      )}

      {!isLoading && memories.length === 0 && (
        <div className="py-10 text-center space-y-2">
          <HeartPulse size={28} className="mx-auto text-celeste-navy/20" />
          <p className="text-celeste-muted text-sm">
            Ancora nessun referto o farmaco qui. Tocca il pulsante sopra per aggiungerne uno.
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs text-celeste-muted uppercase tracking-wide">{day}</p>
          {(items as any[]).map((m) => (
            <MemoryCard key={m.id} memory={m} light />
          ))}
        </div>
      ))}

      <CaptureSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initialTab="image"
        allowedTabs={["image", "document", "medication"]}
        healthMode
      />
    </div>
  );
}
