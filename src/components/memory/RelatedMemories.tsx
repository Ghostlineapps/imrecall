import Link from "next/link";

export function RelatedMemories({ memories }: { memories: any[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-white/50">Ricordi correlati</p>
      {memories.map((m) => (
        <Link key={m.id} href={`/memory/${m.id}`} className="card block hover:bg-white/5 transition-colors">
          <p className="text-sm line-clamp-2">{m.title || m.content}</p>
        </Link>
      ))}
    </div>
  );
}
