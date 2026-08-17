"use client";

import useSWR from "swr";
import Link from "next/link";
import { MemoryCard } from "@/components/timeline/MemoryCard";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RecentMemories() {
  const { data, isLoading } = useSWR("/api/memories?limit=5", fetcher);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-white/50">Ultimi ricordi</h2>
        <Link href="/timeline" className="text-xs text-primary-light">
          Vedi tutti
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {!isLoading && (!data?.memories || data.memories.length === 0) && (
        <p className="text-white/30 text-sm py-4 text-center">
          Nessun ricordo ancora. Scrivi il primo qui sotto.
        </p>
      )}

      <div className="space-y-2">
        {data?.memories?.map((m: any) => (
          <MemoryCard key={m.id} memory={m} />
        ))}
      </div>
    </div>
  );
}
