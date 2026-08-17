"use client";

import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import { MemoryCard } from "@/components/timeline/MemoryCard";
import { TimelineFilters } from "@/components/timeline/TimelineFilters";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const PAGE_SIZE = 20;

export default function TimelinePage() {
  const [filters, setFilters] = useState<{ type?: string; category?: string }>({});

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
    <div className="px-4 pt-6 space-y-5">
      <h1 className="text-xl font-semibold">Timeline</h1>

      <TimelineFilters filters={filters} onChange={setFilters} />

      {isLoading && memories.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wide">{day}</p>
          {items.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </div>
      ))}

      {memories.length > 0 && memories.length % PAGE_SIZE === 0 && (
        <button onClick={() => setSize(size + 1)} className="btn-ghost w-full text-center py-3 text-sm">
          Carica altri
        </button>
      )}
    </div>
  );
}
