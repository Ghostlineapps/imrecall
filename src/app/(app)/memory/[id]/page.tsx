"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2, FileUp } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { RelatedMemories } from "@/components/memory/RelatedMemories";
import { IntentionActions } from "@/components/memory/IntentionActions";
import { CircleBackButton } from "@/components/memory/CircleBackButton";
import { MindMap } from "@/components/memory/MindMap";
import { MindMapTree } from "@/components/memory/MindMapTree";
import { MedicationSchedule } from "@/components/memory/MedicationSchedule";
import { ShareButton } from "@/components/memory/ShareButton";
import { shareText, shareAudio } from "@/lib/share";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// "TEMI:" arriva dal server come testo grezzo puntato (vedi
// buildMeetingPrompt in /api/upload/meeting/route.ts) — qui lo spacchettiamo
// in un vero elenco invece di mostrarlo come blocco di testo.
function parseTopics(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

// 2026-08-26: palette celeste (decima schermata convertita). RelatedMemories,
// IntentionActions, CircleBackButton, MindMap e MedicationSchedule restano
// scuri per ora: sono componenti importati, fuori scope oggi — solo il
// markup di questa pagina passa al tema chiaro.
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
    return (
      <div className="bg-celeste-bg min-h-full px-4 pt-6">
        <div className="card-light h-32 animate-pulse bg-celeste-navy/5" />
      </div>
    );
  }

  // Riassunto/temi/trascrizione separati (metadata, vedi
  // structuredMeta in /api/upload/meeting/route.ts) invece dell'unico
  // blocco di testo in `content` — richiesto dall'utente 2026-09-17.
  // Assenti per riunioni create prima di questo cambio o senza
  // trascrizione utile: in quel caso si torna al vecchio blocco unico
  // (fallback più sotto).
  const hasStructuredSummary = memory.type === "meeting" && !!memory.metadata?.summary;
  const topicsList = hasStructuredSummary ? parseTopics(memory.metadata.topics ?? "") : [];
  // Legacy: mappe generate prima del cambio sono una stringa mermaid
  // (vecchio componente MindMap, disegno SVG statico); quelle nuove sono un
  // albero JSON (nuovo MindMapTree, nodi espandibili al tocco).
  const mindMap = memory.metadata?.mind_map;
  const isLegacyMindMap = typeof mindMap === "string";

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-5 text-celeste-navy">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="btn-ghost-light flex items-center gap-1 text-sm">
          <ArrowLeft size={16} /> Indietro
        </button>
        <button onClick={handleDelete} className="text-celeste-navy/30 hover:text-urgent transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="card-light space-y-3">
        {memory.title && <h1 className="text-lg font-semibold">{memory.title}</h1>}
        {memory.media_url && (memory.type === "image" || memory.type === "medication") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={memory.media_url} alt="" className="rounded-xl w-full object-cover" />
        )}
        {(memory.type === "audio" || memory.type === "meeting") && memory.media_url && (
          <div className="flex items-center gap-2">
            <audio controls src={memory.media_url} className="w-full" />
            <ShareButton
              label="Condividi registrazione"
              onShare={() => shareAudio(memory.media_url, memory.title || "registrazione")}
            />
          </div>
        )}
        {memory.type === "document" && memory.media_url && (
          <a
            href={memory.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost-light flex items-center gap-2 w-full justify-center"
          >
            <FileUp size={16} /> Apri file originale
          </a>
        )}
        {!hasStructuredSummary && (
          <p className="text-celeste-navy/80 leading-relaxed whitespace-pre-wrap">{memory.content}</p>
        )}

        <p className="text-xs text-celeste-muted">
          {format(new Date(memory.memory_date), "d MMMM yyyy, HH:mm", { locale: it })}
        </p>

        {memory.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.map((tag: string) => (
              <span key={tag} className="text-xs bg-celeste-navy/5 text-celeste-muted px-2 py-1 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasStructuredSummary && (
        <div className="card-light">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-celeste-muted">Riassunto</p>
            <ShareButton
              label="Condividi riassunto"
              onShare={() =>
                shareText(
                  memory.title || "Riassunto riunione",
                  [
                    memory.metadata.summary,
                    topicsList.length ? `\nTemi:\n${topicsList.map((t: string) => `- ${t}`).join("\n")}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n")
                )
              }
            />
          </div>
          <p className="text-celeste-navy/80 leading-relaxed whitespace-pre-wrap">{memory.metadata.summary}</p>
        </div>
      )}

      {topicsList.length > 0 && (
        <div className="card-light">
          <p className="text-xs text-celeste-muted mb-1">Temi</p>
          <ul className="space-y-1.5 pl-4 list-disc marker:text-celeste-navy/25">
            {topicsList.map((topic, i) => (
              <li key={i} className="text-celeste-navy/80 text-sm leading-relaxed">
                {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mindMap &&
        (isLegacyMindMap ? (
          <MindMap mermaidSyntax={mindMap} />
        ) : (
          <MindMapTree root={mindMap} />
        ))}

      {hasStructuredSummary && memory.metadata?.transcript && (
        <div className="card-light">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-celeste-muted">Trascrizione</p>
            <ShareButton
              label="Condividi trascrizione"
              onShare={() => shareText(memory.title || "Trascrizione riunione", memory.metadata.transcript)}
            />
          </div>
          <p className="text-celeste-navy/80 leading-relaxed whitespace-pre-wrap text-sm">
            {memory.metadata.transcript}
          </p>
        </div>
      )}

      {memory.type === "medication" && <MedicationSchedule memoryId={memory.id} />}

      {memory.is_intention && (
        <IntentionActions memoryId={memory.id} status={memory.intention_status} onUpdate={mutate} />
      )}

      <CircleBackButton memoryId={memory.id} />

      {memory.related?.length > 0 && <RelatedMemories memories={memory.related} />}
    </div>
  );
}
