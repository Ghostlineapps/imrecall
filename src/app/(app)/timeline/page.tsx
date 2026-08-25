"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { MemoryCard } from "@/components/timeline/MemoryCard";
import { TimelineFilters } from "@/components/timeline/TimelineFilters";
import { SearchBar } from "@/components/timeline/SearchBar";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const PAGE_SIZE = 20;

function TimelineContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? undefined;

  const [filters, setFilters] = useState<{ type?: string; category?: string }>({});
  // Se si arriva qui dalla barra di ricerca in Dashboard con ?q=..., la
  // ricerca parte già valorizzata invece di mostrare la timeline vuota.
  const [searchQuery, setSearchQuery] = useState<string | null>(initialQuery ?? null);

  const getKey = (pageIndex: number, prevData: any) => {
    if (prevData && prevData.memories.length === 0) return null;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (filters.type) params.set("type", filters.type);
    if (filters.category) params.set("category", filters.category);
    if (pageIndex > 0 && prevData?.memories?.length) {
      params.set("cursor", prevData.memories[prevData.memories.length - 1].memory_date);
    }
    return `/api/memories?${params.toString()}`;
  };

  const { data, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher);
  const memories = data?.flatMap((page) => page.memories) ?? [];

  // Ricerca vera: attiva solo quando l'utente digita una query. Riusa lo
  // stesso match_memories() della chat, ma restituisce le memorie grezze
  // (cliccabili) invece di una risposta testuale sintetizzata.
  const { data: searchData, isLoading: isSearching } = useSWR(
    searchQuery ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null,
    fetcher
  );
  const searchResults = searchData?.memories ?? [];

  // Raggruppa per giorno
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
    // Palette celeste (redesign 2026-08-21/25, terza schermata convertita
    // dopo Dashboard e Calendario): stessa struttura di prima, solo colori.
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-5 text-celeste-navy">
      <h1 className="text-xl font-semibold">Ricordi</h1>

      <SearchBar onSearch={setSearchQuery} onClear={() => setSearchQuery(null)} initialValue={initialQuery} />

      {searchQuery ? (
        <div className="space-y-3">
          <p className="text-xs text-celeste-muted uppercase tracking-wide">
            Risultati per &quot;{searchQuery}&quot;
          </p>

          {isSearching && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card-light h-16 animate-pulse bg-celeste-navy/5" />
              ))}
            </div>
          )}

          {!isSearching && searchResults.length === 0 && (
            <p className="text-sm text-celeste-muted py-4 text-center">
              Nessun ricordo trovato per questa ricerca.
            </p>
          )}

          <div className="space-y-2">
            {searchResults.map((m: any) => (
              <MemoryCard key={m.id} memory={m} light />
            ))}
          </div>
        </div>
      ) : (
        <>
          <TimelineFilters filters={filters} onChange={setFilters} />

          {isLoading && memories.length === 0 && (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card-light h-16 animate-pulse bg-celeste-navy/5" />
              ))}
            </div>
          )}

          {Object.entries(grouped).map(([day, items]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs text-celeste-muted uppercase tracking-wide">{day}</p>
              {items.map((m) => (
                <MemoryCard key={m.id} memory={m} light />
              ))}
            </div>
          ))}

          {memories.length > 0 && memories.length % PAGE_SIZE === 0 && (
            <button onClick={() => setSize(size + 1)} className="btn-ghost-light w-full text-center py-3 text-sm">
              Carica altri
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function TimelinePage() {
  return (
    <Suspense fallback={null}>
      <TimelineContent />
    </Suspense>
  );
}
