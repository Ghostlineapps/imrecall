"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, HeartPulse } from "lucide-react";
import { MemoryCard } from "@/components/timeline/MemoryCard";
import { CaptureSheet } from "@/components/capture/CaptureSheet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Non è una nuova categorizzazione né una vista di ricerca alternativa —
// serve solo a rendere visibile che qui si possono caricare referti (esami
// del sangue, visite specialistiche...) come foto o file, oltre ai
// farmaci. La ricerca generica continua a funzionare su tutti i ricordi
// indipendentemente da questa sezione (vedi migrazione 020).
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
    <div className="px-4 pt-6 space-y-5">
      <h1 className="text-xl font-semibold">Salute</h1>
      <p className="text-white/40 text-sm">
        Farmaci, referti ed esami in un unico posto. Carica la foto o il file di un esame del
        sangue, di una visita specialistica o di qualsiasi altro documento medico.
      </p>

      <button
        onClick={() => setSheetOpen(true)}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        <Plus size={18} />
        Aggiungi referto o farmaco
      </button>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {!isLoading && memories.length === 0 && (
        <div className="py-10 text-center space-y-2">
          <HeartPulse size={28} className="mx-auto text-white/20" />
          <p className="text-white/30 text-sm">
            Ancora nessun referto o farmaco qui. Tocca il pulsante sopra per aggiungerne uno.
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wide">{day}</p>
          {(items as any[]).map((m) => (
            <MemoryCard key={m.id} memory={m} />
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
