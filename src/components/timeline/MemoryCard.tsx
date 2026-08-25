import Link from "next/link";
import { FileText, Mic, Users, Image as ImageIcon, Link2, CalendarClock, FileUp, Pill } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import clsx from "clsx";

const TYPE_ICON = {
  text: FileText,
  audio: Mic,
  meeting: Users,
  image: ImageIcon,
  link: Link2,
  deadline: CalendarClock,
  document: FileUp,
  medication: Pill,
};

// `light` sceglie la variante celeste del redesign (usata da Ricordi,
// convertita il 25/08) senza toccare gli altri punti che riusano questa
// stessa card e restano ancora sul tema scuro (es. Salute) — stesso
// principio delle classi *-light in globals.css, applicato qui perché la
// card è condivisa invece che una pagina intera.
export function MemoryCard({ memory, light = false }: { memory: any; light?: boolean }) {
  const Icon = TYPE_ICON[memory.type as keyof typeof TYPE_ICON] ?? FileText;

  return (
    <Link
      href={`/memory/${memory.id}`}
      className={clsx(
        "flex items-start gap-3 transition-colors",
        light ? "card-light hover:bg-celeste-navy/5" : "card hover:bg-white/5"
      )}
    >
      <div className={clsx("p-2 rounded-lg shrink-0", light ? "bg-celeste-navy/5 text-celeste-muted" : "bg-white/5 text-white/50")}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm line-clamp-2">
          {memory.title || memory.content || memory.link_title || "…"}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={clsx("text-xs", light ? "text-celeste-muted" : "text-white/30")}>
            {format(new Date(memory.memory_date), "d MMM yyyy", { locale: it })}
          </span>
          {memory.status === "processing" && (
            <span className="text-xs text-warn">in elaborazione…</span>
          )}
          {memory.categories?.[0] && (
            <span
              className={clsx(
                "text-xs px-2 py-0.5 rounded-full",
                light ? "text-celeste-accentDark bg-celeste-accent/10" : "text-primary-light bg-primary/10"
              )}
            >
              {memory.categories[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
