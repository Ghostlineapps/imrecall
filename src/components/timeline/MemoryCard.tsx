import Link from "next/link";
import { FileText, Mic, Users, Image as ImageIcon, Link2, CalendarClock, FileUp } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const TYPE_ICON = {
  text: FileText,
  audio: Mic,
  meeting: Users,
  image: ImageIcon,
  link: Link2,
  deadline: CalendarClock,
  document: FileUp,
};

export function MemoryCard({ memory }: { memory: any }) {
  const Icon = TYPE_ICON[memory.type as keyof typeof TYPE_ICON] ?? FileText;

  return (
    <Link href={`/memory/${memory.id}`} className="card flex items-start gap-3 hover:bg-white/5 transition-colors">
      <div className="p-2 rounded-lg bg-white/5 text-white/50 shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm line-clamp-2">
          {memory.title || memory.content || memory.link_title || "…"}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-white/30">
            {format(new Date(memory.memory_date), "d MMM yyyy", { locale: it })}
          </span>
          {memory.status === "processing" && (
            <span className="text-xs text-warn">in elaborazione…</span>
          )}
          {memory.categories?.[0] && (
            <span className="text-xs text-primary-light bg-primary/10 px-2 py-0.5 rounded-full">
              {memory.categories[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
