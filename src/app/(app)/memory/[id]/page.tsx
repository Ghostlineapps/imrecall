"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2, FileUp } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { RelatedMemories } from "@/components/memory/RelatedMemories";
import { IntentionActions } from "@/components/memory/IntentionActions";
import { CircleBackButton } from "@/components/memory/CircleBackButton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MemoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: memory, isLoading, mutate } = useSWR(`/api/memories/${id}`, fetcher);

  async function handleDelete() {
    if (!confirm("Eliminare questo ricordo?")) return;
    await fetch(`/api/memories/${id}`, { method: "DELETE" });
    router.push("/timeline");
  }

  if (isLoading || !memory) {
    return <div className="px-4 pt-6"><div className="card h-32 animate-pulse bg-white/5" /></div>;
  }

  return (
    <div className="px-4 pt-6 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="btn-ghost flex items-center gap-1 text-sm">
          <ArrowLeft size={16} /> Indietro
        </button>
        <button onClick={handleDelete} className="text-white/30 hover:text-urgent transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="card space-y-3">
        {memory.title && <h1 className="text-lg font-semibold">{memory.title}</h1>}
        {memory.media_url && memory.type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={memory.media_url} alt="" className="rounded-xl w-full object-cover" />
        )}
        {(memory.type === "audio" || memory.type === "meeting") && memory.media_url && (
          <audio controls src={memory.media_url} className="w-full" />
        )}
        {memory.type === "document" && memory.media_url && (
          <a
            href={memory.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost flex items-center gap-2 w-full justify-center"
          >
            <FileUp size={16} /> Apri file originale
          </a>
        )}
        <p className="text-white/80 leading-relaxed whitespace-pre-wrap">{memory.content}</p>

        <p className="text-xs text-white/30">
          {format(new Date(memory.memory_date), "d MMMM yyyy, HH:mm", { locale: it })}
        </p>

        {memory.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.map((tag: string) => (
              <span key={tag} className="text-xs bg-white/5 text-white/50 px-2 py-1 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {memory.is_intention && (
        <IntentionActions memoryId={memory.id} status={memory.intention_status} onUpdate={mutate} />
      )}

      <CircleBackButton memoryId={memory.id} />

      {memory.related?.length > 0 && <RelatedMemories memories={memory.related} />}
    </div>
  );
}
