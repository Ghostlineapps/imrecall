"use client";

import clsx from "clsx";

const TYPES = [
  { value: undefined, label: "Tutti" },
  { value: "text", label: "Testo" },
  { value: "audio", label: "Voce" },
  { value: "meeting", label: "Riunioni" },
  { value: "image", label: "Foto" },
  { value: "document", label: "File" },
  { value: "medication", label: "Farmaci" },
  { value: "link", label: "Link" },
];

export function TimelineFilters({
  filters,
  onChange,
}: {
  filters: { type?: string; category?: string };
  onChange: (f: { type?: string; category?: string }) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
      {TYPES.map((t) => (
        <button
          key={t.label}
          onClick={() => onChange({ ...filters, type: t.value })}
          className={clsx(
            "px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
            filters.type === t.value
              ? "bg-gradient-to-br from-celeste-accent to-celeste-accentDark text-white"
              : "bg-celeste-navy/5 text-celeste-muted"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
